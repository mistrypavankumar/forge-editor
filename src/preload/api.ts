import { ipcRenderer } from 'electron';
import { IpcChannels, type ForgeApi } from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
  openFolder: () => ipcRenderer.invoke(IpcChannels.openFolder),
  readDirectory: (path) => ipcRenderer.invoke(IpcChannels.readDirectory, path),
  readFile: (path) => ipcRenderer.invoke(IpcChannels.readFile, path),
  writeFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeFile, path, content),
};
