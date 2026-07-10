import { BrowserWindow, clipboard, nativeImage, type IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * IPC for the annotation / screenshot-markup overlay.
 *
 * - `capturePage` grabs a rectangular region of the requesting window's rendered pixels (the
 *   active editor pane) as a PNG data URL. Done in main because only `webContents.capturePage`
 *   can capture Monaco's actual rendered glyphs reliably.
 * - `clipboardWriteImage` puts the finished (code + annotations) PNG on the system clipboard so
 *   the user can paste it straight into Slack, a doc, etc.
 */
export function registerCaptureIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.capturePage, (e, rect: CaptureRect) =>
    toResult(async () => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win) throw new Error('No window for capture');
      // capturePage expects integer device-independent pixels; round to avoid a blank/blurry grab.
      const image = await win.webContents.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      return image.toDataURL();
    }),
  );
  ipcMain.handle(IpcChannels.clipboardWriteImage, (_e, dataUrl: string) =>
    toResult(async () => {
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) throw new Error('Could not decode image for clipboard');
      clipboard.writeImage(image);
    }),
  );
}
