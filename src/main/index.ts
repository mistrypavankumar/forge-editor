import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IpcChannels, pongOf, type ForgeSettings, type TerminalRunArgs } from '@shared/ipc-contract';
import { ok, toResult } from '@shared/result';
import {
  listFilesRecursive,
  readDirectoryEntries,
  readFileText,
  writeFileText,
} from './fs/fs-service';
import { readSettings, writeSettings } from './settings/settings-service';
import { runCommand, killCommand } from './terminal/command-runner';

const SETTINGS_PATH = join(homedir(), '.forge', 'settings.json');

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#1b1b1f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());

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
  ipcMain.handle(IpcChannels.loadSettings, () => toResult(() => readSettings(SETTINGS_PATH)));
  ipcMain.handle(IpcChannels.saveSettings, (_e, settings: ForgeSettings) =>
    toResult(() => writeSettings(SETTINGS_PATH, settings)),
  );
  ipcMain.handle(IpcChannels.terminalRun, (e, args: TerminalRunArgs) =>
    toResult(async () => runCommand(e.sender, args)),
  );
  ipcMain.handle(IpcChannels.terminalKill, (_e, id: string) =>
    toResult(async () => killCommand(id)),
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
