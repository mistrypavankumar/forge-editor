import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import { probePorts } from '../browser/dev-server';

/**
 * IPC for the embedded Browser panel: dev-server port probing and the file:// URL of the guest
 * <webview> inspector preload. The preload is emitted alongside the main window preload
 * (out/preload/webview-preload.cjs); the renderer needs its absolute URL to set the webview's
 * `preload` attribute, and only main can resolve it from __dirname.
 */
export function registerBrowserIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.browserProbePorts, (_e, ports: number[]) =>
    toResult(() => probePorts(ports)),
  );
  ipcMain.handle(IpcChannels.browserPreloadPath, () =>
    toResult(async () => pathToFileURL(join(__dirname, '../preload/webview-preload.cjs')).href),
  );
}
