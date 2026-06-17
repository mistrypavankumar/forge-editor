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
  readDirectory: (path) => ipcRenderer.invoke(IpcChannels.readDirectory, path),
  readFile: (path) => ipcRenderer.invoke(IpcChannels.readFile, path),
  writeFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeFile, path, content),
  listFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.listFiles, rootPath),
  gitBranch: (rootPath) => ipcRenderer.invoke(IpcChannels.gitBranch, rootPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke(IpcChannels.rename, oldPath, newPath),
  remove: (path) => ipcRenderer.invoke(IpcChannels.remove, path),
  copyEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.copyEntry, src, destDir),
  moveEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.moveEntry, src, destDir),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
  runCommand: (args) => ipcRenderer.invoke(IpcChannels.terminalRun, args),
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
