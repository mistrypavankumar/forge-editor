import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import {
  awsConfigPaths,
  getActiveProfile,
  listProfiles,
  setActiveProfile,
  validateProfile,
} from '../aws/aws-service';
import { readSettings, writeSettings } from '../settings/settings-service';

/**
 * Wire the AWS connection switcher into IPC. Profile discovery and validation shell out to
 * the AWS CLI (see aws-service); the active profile is held in-process — and injected into
 * newly-spawned terminals — and persisted to `settingsPath` so it survives restarts.
 */
export function registerAwsIpc(ipcMain: IpcMain, settingsPath: string): void {
  ipcMain.handle(IpcChannels.awsListProfiles, () => toResult(() => listProfiles()));
  ipcMain.handle(IpcChannels.awsValidateProfile, (_e, name: string) =>
    toResult(() => validateProfile(name)),
  );
  ipcMain.handle(IpcChannels.awsGetActiveProfile, () => toResult(async () => getActiveProfile()));
  ipcMain.handle(IpcChannels.awsConfigPaths, () => toResult(async () => awsConfigPaths()));
  ipcMain.handle(
    IpcChannels.awsSetActiveProfile,
    (_e, name: string | null, region: string | null) =>
      toResult(async () => {
        setActiveProfile(name, region ?? null);
        const settings = await readSettings(settingsPath);
        await writeSettings(settingsPath, {
          ...settings,
          awsProfile: name ?? undefined,
          awsRegion: region ?? undefined,
        });
      }),
  );
}
