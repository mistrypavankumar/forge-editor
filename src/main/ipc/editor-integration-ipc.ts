import type { IpcMain } from 'electron';
import { app } from 'electron';
import { homedir } from 'node:os';
import { IpcChannels, type EditorIntegrationStatus } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import {
  resolveIntegrationPaths,
  install,
  uninstall,
  status,
  type IntegrationPaths,
} from '../editor-integration/installer';

/** The Forge.app bundle path, derived from the running executable (…/Forge.app/Contents/MacOS/Forge). */
function appBundlePath(): string {
  return app.getPath('exe').replace(/\/Contents\/MacOS\/[^/]+$/, '');
}

function currentPaths(): IntegrationPaths {
  return resolveIntegrationPaths(homedir(), process.env.SHELL, appBundlePath());
}

async function toStatus(paths: IntegrationPaths): Promise<EditorIntegrationStatus> {
  const { installed } = await status(paths);
  return { installed, shimPath: paths.shimPath, profilePath: paths.profilePath };
}

export function registerEditorIntegrationIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.editorIntegrationStatus, () =>
    toResult(() => toStatus(currentPaths())),
  );
  ipcMain.handle(IpcChannels.editorIntegrationInstall, () =>
    toResult(async () => {
      const paths = currentPaths();
      await install(paths);
      return toStatus(paths);
    }),
  );
  ipcMain.handle(IpcChannels.editorIntegrationUninstall, () =>
    toResult(async () => {
      const paths = currentPaths();
      await uninstall(paths);
      return toStatus(paths);
    }),
  );
}
