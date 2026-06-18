import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type ForgeApi,
  type TerminalDataEvent,
  type TerminalExitEvent,
} from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
  openFolder: () => ipcRenderer.invoke(IpcChannels.openFolder),
  openFileDialog: () => ipcRenderer.invoke(IpcChannels.openFileDialog),
  saveDialog: (defaultName) => ipcRenderer.invoke(IpcChannels.saveDialog, defaultName),
  readDirectory: (path) => ipcRenderer.invoke(IpcChannels.readDirectory, path),
  readFile: (path) => ipcRenderer.invoke(IpcChannels.readFile, path),
  writeFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeFile, path, content),
  listFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.listFiles, rootPath),
  gitBranch: (rootPath) => ipcRenderer.invoke(IpcChannels.gitBranch, rootPath),
  gitChangedFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.gitChanges, rootPath),
  gitCommit: (rootPath, message) => ipcRenderer.invoke(IpcChannels.gitCommit, rootPath, message),
  gitStage: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitStage, rootPath, path),
  gitUnstage: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitUnstage, rootPath, path),
  gitDiscard: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitDiscard, rootPath, path),
  gitStageAll: (rootPath) => ipcRenderer.invoke(IpcChannels.gitStageAll, rootPath),
  gitOriginal: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitOriginal, rootPath, path),
  gitStaged: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitStaged, rootPath, path),
  gitBlame: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitBlame, rootPath, path),
  search: (rootPath, query) => ipcRenderer.invoke(IpcChannels.search, rootPath, query),
  watchWorkspace: (rootPath) => ipcRenderer.send(IpcChannels.watchWorkspace, rootPath),
  onFsChanged: (cb) => {
    const listener = (): void => cb();
    ipcRenderer.on(IpcChannels.fsChanged, listener);
    return () => ipcRenderer.removeListener(IpcChannels.fsChanged, listener);
  },
  onMenuAction: (cb) => {
    const listener = (_e: unknown, id: string): void => cb(id);
    ipcRenderer.on(IpcChannels.menuAction, listener);
    return () => ipcRenderer.removeListener(IpcChannels.menuAction, listener);
  },
  syncMenuState: (autoSave) => ipcRenderer.send(IpcChannels.menuSyncState, autoSave),
  isMac: process.platform === 'darwin',
  rename: (oldPath, newPath) => ipcRenderer.invoke(IpcChannels.rename, oldPath, newPath),
  remove: (path) => ipcRenderer.invoke(IpcChannels.remove, path),
  copyEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.copyEntry, src, destDir),
  moveEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.moveEntry, src, destDir),
  mkdir: (path) => ipcRenderer.invoke(IpcChannels.mkdir, path),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
  runFormatter: (rootPath, tool, args) =>
    ipcRenderer.invoke(IpcChannels.runFormatter, rootPath, tool, args),
  formatText: (rootPath, tool, args, input) =>
    ipcRenderer.invoke(IpcChannels.formatText, rootPath, tool, args, input),
  createTerminal: (args) => ipcRenderer.invoke(IpcChannels.terminalCreate, args),
  sendInput: (id, data) => ipcRenderer.send(IpcChannels.terminalInput, id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send(IpcChannels.terminalResize, id, cols, rows),
  killCommand: (id) => ipcRenderer.invoke(IpcChannels.terminalKill, id),
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.openExternal, url),
  onTerminalData: (cb) => {
    const listener = (_e: unknown, payload: TerminalDataEvent): void => cb(payload);
    ipcRenderer.on(IpcChannels.terminalData, listener);
    return () => ipcRenderer.removeListener(IpcChannels.terminalData, listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_e: unknown, payload: TerminalExitEvent): void => cb(payload);
    ipcRenderer.on(IpcChannels.terminalExit, listener);
    return () => ipcRenderer.removeListener(IpcChannels.terminalExit, listener);
  },
};
