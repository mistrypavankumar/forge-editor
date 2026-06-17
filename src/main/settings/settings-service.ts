import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { ForgeSettings } from '@shared/ipc-contract';

export async function readSettings(filePath: string): Promise<ForgeSettings> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ForgeSettings;
  } catch {
    return {};
  }
}

export async function writeSettings(filePath: string, settings: ForgeSettings): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
}
