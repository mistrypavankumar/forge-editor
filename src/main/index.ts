import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import {
  IpcChannels,
  pongOf,
  type ForgeSettings,
  type GitUser,
  type SearchOptions,
  type TerminalCreateArgs,
} from '@shared/ipc-contract';
import { ok, toResult } from '@shared/result';
import {
  copyEntry,
  deleteEntry,
  listFilesRecursive,
  makeDir,
  moveEntry,
  readDirectoryEntries,
  readFileText,
  readGitBranch,
  renameEntry,
  writeFileText,
} from './fs/fs-service';
import { readSettings, writeSettings } from './settings/settings-service';
import { runFormatter, formatText } from './format/format-service';
import { runDiagnostics } from './diagnostics/diagnostics-service';
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
  getBranches,
  checkoutBranch,
  createBranch,
  gitPush,
  gitPull,
  gitFetch,
  getGitLog,
  getCommitFiles,
  getFileAtRef,
  getGitUser,
  setGitUser,
  testGitCredential,
  ghAuth,
  ghAccounts,
} from './git/git-service';
import { searchInFiles, replaceInFiles } from './search/search-service';
import { hydratePathFromLoginShell } from './env/resolve-path';
import { registerLanguageIpc } from './ipc/editor-language-ipc';
import { registerAwsIpc } from './ipc/aws-ipc';
import { setActiveProfile } from './aws/aws-service';
import { watchWorkspace } from './fs/watcher';
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
} from './terminal/command-runner';

const SETTINGS_PATH = join(homedir(), '.forge', 'settings.json');
/** Backing file for the per-repo git credential store the user-switcher writes to. */
const CREDENTIALS_PATH = join(homedir(), '.forge', 'git-credentials');
const isMac = process.platform === 'darwin';
let autoSaveState = false;

function menuAction(id: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannels.menuAction, id);
}

/** macOS: a full File menu in the native menu bar. Other platforms use the in-window menu. */
function buildAppMenu(): void {
  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'New Text File', click: () => menuAction('file.newTextFile') },
      { label: 'New File…', click: () => menuAction('file.newFile') },
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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0a0a0c',
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
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
  ipcMain.handle(IpcChannels.gitPull, (_e, rootPath: string) => toResult(() => gitPull(rootPath)));
  ipcMain.handle(IpcChannels.gitFetch, (_e, rootPath: string) => toResult(() => gitFetch(rootPath)));
  ipcMain.handle(IpcChannels.gitLog, (_e, rootPath: string, limit?: number) =>
    toResult(() => getGitLog(rootPath, limit)),
  );
  ipcMain.handle(IpcChannels.gitCommitFiles, (_e, rootPath: string, hash: string) =>
    toResult(() => getCommitFiles(rootPath, hash)),
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
  ipcMain.handle(IpcChannels.resolveImport, (_e, rootPath: string, fromFile: string, spec: string) =>
    toResult(() => resolveImport(rootPath, fromFile, spec)),
  );
  ipcMain.handle(IpcChannels.terminalCreate, (e, args: TerminalCreateArgs) =>
    toResult(async () => createTerminal(e.sender, args)),
  );
  ipcMain.on(IpcChannels.terminalInput, (_e, id: string, data: string) => writeTerminal(id, data));
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
  registerAwsIpc(ipcMain, SETTINGS_PATH);
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
