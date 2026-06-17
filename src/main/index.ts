import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  IpcChannels,
  pongOf,
  type ForgeSettings,
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
import {
  getGitChanges,
  gitCommit,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitStageAll,
  searchInFiles,
} from './git/git-service';
import { watchWorkspace } from './fs/watcher';
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
} from './terminal/command-runner';

const SETTINGS_PATH = join(homedir(), '.forge', 'settings.json');

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

app.whenReady().then(() => {
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
  ipcMain.handle(IpcChannels.readDirectory, (_e, path: string) =>
    toResult(() => readDirectoryEntries(path)),
  );
  ipcMain.handle(IpcChannels.readFile, (_e, path: string) => toResult(() => readFileText(path)));
  ipcMain.handle(IpcChannels.writeFile, (_e, path: string, content: string) =>
    toResult(() => writeFileText(path, content)),
  );
  ipcMain.handle(IpcChannels.listFiles, (_e, rootPath: string) =>
    toResult(() => listFilesRecursive(rootPath)),
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
  ipcMain.handle(IpcChannels.search, (_e, rootPath: string, query: string) =>
    toResult(() => searchInFiles(rootPath, query)),
  );
  ipcMain.on(IpcChannels.watchWorkspace, (e, rootPath: string) =>
    watchWorkspace(e.sender, rootPath),
  );
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
    toResult(() => writeSettings(SETTINGS_PATH, settings)),
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
