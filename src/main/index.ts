import { homedir } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import {
  IpcChannels,
  pongOf,
  type AgentCompleteArgs,
  type AgentRunCommandArgs,
  type AssistantSendArgs,
  type CompletionArgs,
  type ForgeSettings,
  type GitUser,
  type SearchOptions,
  type TerminalCreateArgs,
} from '@shared/ipc-contract';
import type { GenerateSkeletonInput } from '@shared/skeleton';
import { ok, toResult } from '@shared/result';
import {
  copyEntry,
  deleteEntry,
  listFilesRecursive,
  makeDir,
  moveEntry,
  readDirectoryEntries,
  readFileBase64,
  readFileText,
  readGitBranch,
  renameEntry,
  writeFileText,
} from './fs/fs-service';
import { readSettings, writeSettings } from './settings/settings-service';
import { runFormatter, formatText } from './format/format-service';
import { runDiagnostics } from './diagnostics/diagnostics-service';
import { runInline } from './execution/code-runner';
import { resolveImport } from './navigation/resolve-import';
import {
  getGitBlame,
  getGitChanges,
  getGitOriginalContent,
  getGitStagedContent,
  gitCommit,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitStageAll,
  gitUnstageAll,
  gitDiscardAll,
  getBranches,
  checkoutBranch,
  createBranch,
  gitPush,
  publishBranch,
  gitPull,
  gitFetch,
  getAheadBehind,
  getGitLog,
  searchGitLog,
  getGitRefsSig,
  getCommitFiles,
  getCommitDetail,
  getFileAtRef,
  getGitUser,
  setGitUser,
  testGitCredential,
  ghAuth,
  ghAccounts,
} from './git/git-service';
import { generateCommitMessage } from './ai/commit-message-service';
import { startAssistant, cancelAssistant } from './ai/assistant-service';
import { runAgentCompletion, cancelAgent } from './ai/agent-service';
import { runAgentCommand, cancelAgentCommand } from './agent/command-exec';
import { buildCodeMap } from './codemap/codemap-service';
import {
  detectSkeletonComponents,
  runGenerateSkeleton,
  runGenerateSkeletonAi,
} from './skeleton/skeleton-service';
import { startCompletion, cancelCompletion } from './ai/completion-service';
import { resolveAi, resolveCompletionAi } from './ai/ai-config';
import { aiKeyStatus, setAiKey } from './ai/ai-credentials';
import { searchInFiles, replaceInFiles } from './search/search-service';
import { hydratePathFromLoginShell } from './env/resolve-path';
import { registerLanguageIpc } from './ipc/editor-language-ipc';
import { jdtlsService } from './java/jdtls-service';
import { registerAwsIpc } from './ipc/aws-ipc';
import { registerEditorIntegrationIpc } from './ipc/editor-integration-ipc';
import { registerApiRequestIpc } from './ipc/api-request-ipc';
import { registerDebugIpc } from './debug/debug-ipc';
import { setActiveProfile } from './aws/aws-service';
import { watchWorkspace } from './fs/watcher';
import {
  createTerminal,
  writeTerminal,
  ackTerminal,
  resizeTerminal,
  killTerminal,
} from './terminal/command-runner';

const SETTINGS_PATH = join(homedir(), '.forge', 'settings.json');
/** Backing file for the per-repo git credential store the user-switcher writes to. */
const CREDENTIALS_PATH = join(homedir(), '.forge', 'git-credentials');
/** Backing file (0600) for AI provider API keys — kept out of settings.json. */
const AI_CREDENTIALS_PATH = join(homedir(), '.forge', 'ai-credentials');
const isMac = process.platform === 'darwin';
let autoSaveState = false;

/**
 * Files the OS asked us to open before a window was ready to receive them — from Finder's
 * "Open With", a drop on the dock/taskbar icon, or paths on the command line. They're held
 * here and flushed to the renderer once a window has finished loading.
 */
const pendingOpenFiles: string[] = [];

/** Queue a file to open and deliver it (or hold it until a window is ready). */
function requestOpenFile(filePath: string): void {
  pendingOpenFiles.push(filePath);
  if (app.isReady()) {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else flushPendingFiles();
  }
}

/** Hand any queued files to a loaded window; if the window is still loading, wait for it. */
function flushPendingFiles(target?: BrowserWindow): void {
  if (pendingOpenFiles.length === 0) return;
  const win = target ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win || win.isDestroyed()) return;
  const send = (): void => {
    if (win.isDestroyed()) return;
    for (const path of pendingOpenFiles.splice(0)) win.webContents.send(IpcChannels.openPath, path);
    if (win.isMinimized()) win.restore();
    win.focus();
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
}

/**
 * Pull openable file paths out of a process argv. On Windows/Linux the OS launches us with the
 * file path appended; argv[0] is the executable (plus the app entry in dev), and switches start
 * with `-`. We only accept args that resolve to an existing file.
 */
function filePathsFromArgv(argv: string[]): string[] {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((arg) => !arg.startsWith('-') && existsSync(arg) && statSync(arg).isFile());
}

function menuAction(id: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannels.menuAction, id);
}

/**
 * Each window's currently-open workspace, keyed by webContents id and reported by the renderer.
 * Backs the title-bar window switcher's list of open windows.
 */
const windowWorkspaces = new Map<number, { rootPath: string | null; name: string }>();

/** Tell every live window that the set of open windows (or their focus/workspace) changed. */
function broadcastWindows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.windowsChanged);
  }
}

/** macOS: a full File menu in the native menu bar. Other platforms use the in-window menu. */
function buildAppMenu(): void {
  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'New Text File', click: () => menuAction('file.newTextFile') },
      { label: 'New File…', click: () => menuAction('file.newFile') },
      { label: 'New Window', click: () => createWindow() },
      { type: 'separator' },
      { label: 'Open File…', click: () => menuAction('file.openFile') },
      { label: 'Open Folder…', click: () => menuAction('file.openFolder') },
      { type: 'separator' },
      { label: 'Save', click: () => menuAction('file.save') },
      { type: 'separator' },
      { label: 'Auto Save', type: 'checkbox', checked: autoSaveState, click: () => menuAction('toggleAutoSave') },
      { label: 'Revert File', click: () => menuAction('file.revert') },
      { type: 'separator' },
      { label: 'Close Editor', click: () => menuAction('file.closeEditor') },
      { label: 'Close Folder', click: () => menuAction('file.closeFolder') },
      { type: 'separator' },
      { role: 'close' },
    ],
  };
  const template: Electron.MenuItemConstructorOptions[] = isMac
    ? [{ role: 'appMenu' }, fileMenu, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]
    : [{ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(initialFolder?: string): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    // On macOS use a native vibrancy material so the blurred desktop shows through any
    // translucent pixel of the renderer (the frosted-glass look). The window background
    // must be fully transparent for the material to be visible; `visualEffectState:
    // 'active'` keeps the blur lit even when the window is unfocused. Other platforms
    // keep an opaque background (vibrancy is macOS-only).
    backgroundColor: isMac ? '#00000000' : '#0a0a0c',
    ...(isMac ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Track this window for the switcher; refresh every window's list on focus/blur/close.
  const winId = win.webContents.id;
  win.on('focus', broadcastWindows);
  win.on('blur', broadcastWindows);
  win.on('closed', () => {
    windowWorkspaces.delete(winId);
    broadcastWindows();
  });

  win.webContents.on('did-finish-load', () => {
    // Deliver any files the OS queued for us (Open With / CLI args) once the UI can receive them.
    flushPendingFiles(win);
    // A window opened to show a specific folder (from the switcher's recents) loads it now.
    if (initialFolder) win.webContents.send(IpcChannels.openFolderInWindow, initialFolder);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Hold a single-instance lock so a relaunch (e.g. "Open With" on Windows/Linux) forwards its
// files to the running app instead of spawning a duplicate. macOS already enforces this for
// .app bundles and routes files through `open-file`, but the lock is harmless there.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

app.on('second-instance', (_event, argv) => {
  for (const filePath of filePathsFromArgv(argv)) requestOpenFile(filePath);
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// macOS hands us files to open via `open-file` — Finder's "Open With", or a file dropped on the
// dock icon. It can fire before the app is ready, so registered here at module load.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  requestOpenFile(filePath);
});

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  // First-launch files arrive on the command line (Windows/Linux). Queue them so the first
  // window flushes them once it has finished loading.
  for (const filePath of filePathsFromArgv(process.argv)) pendingOpenFiles.push(filePath);
  // GUI-launched (packaged) builds inherit only the bare system PATH, so Homebrew tools
  // like `gh` aren't found when we shell out from the main process. Hydrate PATH from a
  // login shell before registering IPC so the git-user switcher can see the gh account.
  if (app.isPackaged) await hydratePathFromLoginShell();
  // Packaged builds get their icon from the app bundle (build/icon.icns). During
  // `electron-vite dev` there is no bundle, so set the dock icon from source.
  if (isMac && !app.isPackaged) {
    app.dock?.setIcon(join(process.cwd(), 'build', 'icon.png'));
  }
  buildAppMenu();
  ipcMain.handle(IpcChannels.ping, (_event, msg: string) => pongOf(msg));
  ipcMain.handle(IpcChannels.openFolder, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return ok(null);
    const rootPath = res.filePaths[0];
    return toResult(async () => ({ rootPath, tree: await readDirectoryEntries(rootPath) }));
  });
  ipcMain.handle(IpcChannels.openFileDialog, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (res.canceled || res.filePaths.length === 0) return ok(null);
    const path = res.filePaths[0];
    return toResult(async () => ({ path, name: basename(path), content: await readFileText(path) }));
  });
  ipcMain.handle(IpcChannels.saveDialog, async (_e, defaultName: string) => {
    const res = await dialog.showSaveDialog({ defaultPath: defaultName });
    return ok(res.canceled || !res.filePath ? null : res.filePath);
  });
  ipcMain.handle(IpcChannels.readDirectory, (_e, path: string) =>
    toResult(() => readDirectoryEntries(path)),
  );
  ipcMain.handle(IpcChannels.readFile, (_e, path: string) => toResult(() => readFileText(path)));
  ipcMain.handle(IpcChannels.readFileBase64, (_e, path: string) =>
    toResult(() => readFileBase64(path)),
  );
  ipcMain.handle(IpcChannels.writeFile, (_e, path: string, content: string) =>
    toResult(() => writeFileText(path, content)),
  );
  ipcMain.handle(IpcChannels.listFiles, (_e, rootPath: string) =>
    toResult(async () => {
      const settings = await readSettings(SETTINGS_PATH);
      return listFilesRecursive(rootPath, settings.searchExclude ?? []);
    }),
  );
  ipcMain.handle(IpcChannels.gitBranch, (_e, rootPath: string) =>
    toResult(() => readGitBranch(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitChanges, (_e, rootPath: string) =>
    toResult(() => getGitChanges(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitCommit, (_e, rootPath: string, message: string) =>
    toResult(() => gitCommit(rootPath, message)),
  );
  ipcMain.handle(IpcChannels.gitStage, (_e, rootPath: string, path: string) =>
    toResult(() => gitStage(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitUnstage, (_e, rootPath: string, path: string) =>
    toResult(() => gitUnstage(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitDiscard, (_e, rootPath: string, path: string) =>
    toResult(() => gitDiscard(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitStageAll, (_e, rootPath: string) =>
    toResult(() => gitStageAll(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitUnstageAll, (_e, rootPath: string) =>
    toResult(() => gitUnstageAll(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitDiscardAll, (_e, rootPath: string) =>
    toResult(() => gitDiscardAll(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitOriginal, (_e, rootPath: string, path: string) =>
    toResult(() => getGitOriginalContent(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitStaged, (_e, rootPath: string, path: string) =>
    toResult(() => getGitStagedContent(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitBlame, (_e, rootPath: string, path: string) =>
    toResult(() => getGitBlame(rootPath, path)),
  );
  ipcMain.handle(IpcChannels.gitBranches, (_e, rootPath: string) =>
    toResult(() => getBranches(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitCheckout, (_e, rootPath: string, name: string) =>
    toResult(() => checkoutBranch(rootPath, name)),
  );
  ipcMain.handle(IpcChannels.gitCreateBranch, (_e, rootPath: string, name: string) =>
    toResult(() => createBranch(rootPath, name)),
  );
  ipcMain.handle(IpcChannels.gitPush, (_e, rootPath: string) => toResult(() => gitPush(rootPath)));
  ipcMain.handle(IpcChannels.gitPublishBranch, (_e, rootPath: string) =>
    toResult(() => publishBranch(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitPull, (_e, rootPath: string) => toResult(() => gitPull(rootPath)));
  ipcMain.handle(IpcChannels.gitFetch, (_e, rootPath: string) => toResult(() => gitFetch(rootPath)));
  ipcMain.handle(IpcChannels.gitAheadBehind, (_e, rootPath: string) =>
    toResult(() => getAheadBehind(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitLog, (_e, rootPath: string, limit?: number) =>
    toResult(() => getGitLog(rootPath, limit)),
  );
  ipcMain.handle(
    IpcChannels.gitSearchLog,
    (_e, rootPath: string, query: string, limit?: number) =>
      toResult(() => searchGitLog(rootPath, query, limit)),
  );
  ipcMain.handle(IpcChannels.gitRefsSig, (_e, rootPath: string) =>
    toResult(() => getGitRefsSig(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitCommitFiles, (_e, rootPath: string, hash: string) =>
    toResult(() => getCommitFiles(rootPath, hash)),
  );
  ipcMain.handle(IpcChannels.gitCommitDetail, (_e, rootPath: string, hash: string) =>
    toResult(() => getCommitDetail(rootPath, hash)),
  );
  ipcMain.handle(IpcChannels.gitFileAt, (_e, rootPath: string, ref: string, relPath: string) =>
    toResult(() => getFileAtRef(rootPath, ref, relPath)),
  );
  ipcMain.handle(IpcChannels.gitGetUser, (_e, rootPath: string) =>
    toResult(() => getGitUser(rootPath)),
  );
  ipcMain.handle(IpcChannels.gitSetUser, (_e, rootPath: string, user: GitUser) =>
    toResult(() => setGitUser(rootPath, user, CREDENTIALS_PATH)),
  );
  ipcMain.handle(
    IpcChannels.gitTestCredential,
    (_e, rootPath: string, username: string, token: string) =>
      toResult(() => testGitCredential(rootPath, username, token)),
  );
  ipcMain.handle(IpcChannels.gitGhAuth, (_e, rootPath: string) => toResult(() => ghAuth(rootPath)));
  ipcMain.handle(IpcChannels.gitGhAccounts, (_e, rootPath: string) =>
    toResult(() => ghAccounts(rootPath)),
  );
  ipcMain.handle(IpcChannels.aiCommitMessage, (_e, rootPath: string) =>
    toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return generateCommitMessage(cfg, rootPath);
    }),
  );
  ipcMain.handle(IpcChannels.assistantSend, (e, args: AssistantSendArgs) =>
    toResult(async () => {
      const sender = e.sender;
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      startAssistant(
        cfg,
        args,
        (delta) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.assistantChunk, { id: args.id, delta });
        },
        (error) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.assistantDone, { id: args.id, error });
        },
      );
    }),
  );
  ipcMain.on(IpcChannels.assistantCancel, (_e, id: string) => cancelAssistant(id));
  ipcMain.handle(IpcChannels.agentComplete, (_e, args: AgentCompleteArgs) =>
    toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return runAgentCompletion(cfg, args);
    }),
  );
  ipcMain.on(IpcChannels.agentCancel, (_e, id: string) => cancelAgent(id));
  ipcMain.handle(IpcChannels.agentRunCommand, (_e, args: AgentRunCommandArgs) =>
    toResult(() => runAgentCommand(args)),
  );
  ipcMain.on(IpcChannels.agentCancelCommand, (_e, id: string) => cancelAgentCommand(id));
  ipcMain.handle(IpcChannels.codemapBuild, (_e, rootPath: string, force?: boolean) =>
    toResult(() => buildCodeMap(rootPath, SETTINGS_PATH, force)),
  );
  ipcMain.handle(IpcChannels.skeletonDetect, (_e, filePath: string, code: string) =>
    toResult(async () => detectSkeletonComponents(filePath, code)),
  );
  ipcMain.handle(IpcChannels.skeletonGenerate, (_e, input: GenerateSkeletonInput) =>
    toResult(async () => runGenerateSkeleton(input)),
  );
  ipcMain.handle(IpcChannels.skeletonGenerateAi, (_e, input: GenerateSkeletonInput) =>
    toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return runGenerateSkeletonAi(cfg, input);
    }),
  );
  ipcMain.handle(IpcChannels.aiCompletion, (_e, args: CompletionArgs) =>
    toResult(async () => {
      const cfg = await resolveCompletionAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return new Promise<string>((resolve) => startCompletion(cfg, args, resolve));
    }),
  );
  ipcMain.on(IpcChannels.aiCompletionCancel, (_e, id: string) => cancelCompletion(id));
  ipcMain.handle(IpcChannels.aiKeyStatus, () => toResult(() => aiKeyStatus(AI_CREDENTIALS_PATH)));
  ipcMain.handle(IpcChannels.aiSetKey, (_e, provider: 'anthropic' | 'openai', key: string) =>
    toResult(() => setAiKey(AI_CREDENTIALS_PATH, provider, key)),
  );
  ipcMain.handle(IpcChannels.search, (_e, rootPath: string, options: SearchOptions) =>
    toResult(() => searchInFiles(rootPath, options)),
  );
  ipcMain.handle(
    IpcChannels.replaceInFiles,
    (_e, rootPath: string, options: SearchOptions, replacement: string, files: string[]) =>
      toResult(() => replaceInFiles(rootPath, options, replacement, files)),
  );
  ipcMain.on(IpcChannels.watchWorkspace, (e, rootPath: string) =>
    watchWorkspace(e.sender, rootPath),
  );
  ipcMain.on(IpcChannels.menuSyncState, (_e, autoSave: boolean) => {
    autoSaveState = autoSave;
    buildAppMenu();
  });
  ipcMain.on(IpcChannels.newWindow, () => createWindow());
  ipcMain.on(IpcChannels.windowReport, (e, rootPath: string | null, name: string) => {
    windowWorkspaces.set(e.sender.id, { rootPath, name });
    broadcastWindows();
  });
  ipcMain.handle(IpcChannels.windowList, () =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => {
        const info = windowWorkspaces.get(w.webContents.id);
        return {
          id: w.webContents.id,
          rootPath: info?.rootPath ?? null,
          name: info?.name ?? 'No workspace',
          focused: w.isFocused(),
        };
      }),
  );
  ipcMain.on(IpcChannels.windowFocus, (_e, id: number) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.id === id);
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  ipcMain.on(IpcChannels.windowOpenFolder, (_e, path: string) => createWindow(path));
  ipcMain.handle(IpcChannels.rename, (_e, oldPath: string, newPath: string) =>
    toResult(() => renameEntry(oldPath, newPath)),
  );
  ipcMain.handle(IpcChannels.remove, (_e, path: string) => toResult(() => deleteEntry(path)));
  ipcMain.handle(IpcChannels.copyEntry, (_e, src: string, destDir: string) =>
    toResult(() => copyEntry(src, destDir)),
  );
  ipcMain.handle(IpcChannels.moveEntry, (_e, src: string, destDir: string) =>
    toResult(() => moveEntry(src, destDir)),
  );
  ipcMain.handle(IpcChannels.mkdir, (_e, path: string) => toResult(() => makeDir(path)));
  ipcMain.handle(IpcChannels.loadSettings, () => toResult(() => readSettings(SETTINGS_PATH)));
  ipcMain.handle(IpcChannels.saveSettings, (_e, settings: ForgeSettings) =>
    toResult(async () => {
      // Merge so a partial save (e.g. the renderer hook, which omits awsProfile) doesn't
      // clobber fields owned by other writers like the AWS switcher.
      const existing = await readSettings(SETTINGS_PATH);
      await writeSettings(SETTINGS_PATH, { ...existing, ...settings });
    }),
  );
  ipcMain.handle(IpcChannels.runFormatter, (_e, rootPath: string, tool: string, args: string[]) =>
    toResult(() => runFormatter(rootPath, tool, args)),
  );
  ipcMain.handle(
    IpcChannels.formatText,
    (_e, rootPath: string, tool: string, args: string[], input: string) =>
      toResult(() => formatText(rootPath, tool, args, input)),
  );
  ipcMain.handle(IpcChannels.runDiagnostics, (_e, rootPath: string) =>
    toResult(() => runDiagnostics(rootPath)),
  );
  ipcMain.handle(IpcChannels.runInline, (_e, code: string, filePath: string, languageId: string, runExport?: boolean) =>
    toResult(() => runInline(code, filePath, languageId, runExport)),
  );
  ipcMain.handle(IpcChannels.resolveImport, (_e, rootPath: string, fromFile: string, spec: string) =>
    toResult(() => resolveImport(rootPath, fromFile, spec)),
  );
  ipcMain.handle(IpcChannels.terminalCreate, (e, args: TerminalCreateArgs) =>
    toResult(async () => createTerminal(e.sender, args)),
  );
  ipcMain.on(IpcChannels.terminalInput, (_e, id: string, data: string) => writeTerminal(id, data));
  ipcMain.on(IpcChannels.terminalAck, (_e, id: string, charCount: number) =>
    ackTerminal(id, charCount),
  );
  ipcMain.on(IpcChannels.terminalResize, (_e, id: string, cols: number, rows: number) =>
    resizeTerminal(id, cols, rows),
  );
  ipcMain.handle(IpcChannels.terminalKill, (_e, id: string) =>
    toResult(async () => killTerminal(id)),
  );
  ipcMain.handle(IpcChannels.openExternal, (_e, url: string) =>
    toResult(() => shell.openExternal(url)),
  );
  registerLanguageIpc(ipcMain);
  // Java (jdtls) status: answer the initial query and broadcast lifecycle changes to every window.
  ipcMain.handle(IpcChannels.jdtlsGetStatus, () => jdtlsService.getStatus());
  jdtlsService.setStatusNotifier((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.jdtlsStatus, status);
    }
  });
  registerAwsIpc(ipcMain, SETTINGS_PATH);
  registerEditorIntegrationIpc(ipcMain);
  registerApiRequestIpc(ipcMain);
  registerDebugIpc(ipcMain);
  // Restore the active AWS connection so new terminals get AWS_PROFILE from the first launch.
  void readSettings(SETTINGS_PATH).then((s) => setActiveProfile(s.awsProfile ?? null, s.awsRegion ?? null));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
