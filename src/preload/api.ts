import { ipcRenderer } from 'electron';
import { IpcChannels, type ForgeApi } from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
};
