import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** API keys for the cloud AI providers. Kept out of settings.json in a 0600 file. */
export interface AiCredentials {
  anthropic?: string;
  openai?: string;
}

/** Which providers currently have a key on file — surfaced to the UI without exposing the key. */
export interface AiKeyStatus {
  anthropic: boolean;
  openai: boolean;
}

export async function readAiCredentials(path: string): Promise<AiCredentials> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AiCredentials;
  } catch {
    return {};
  }
}

/** Set (or, with an empty string, clear) one provider's key, persisting with 0600 permissions. */
export async function setAiKey(
  path: string,
  provider: 'anthropic' | 'openai',
  key: string,
): Promise<void> {
  const creds = await readAiCredentials(path);
  if (key.trim()) creds[provider] = key.trim();
  else delete creds[provider];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(creds, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function aiKeyStatus(path: string): Promise<AiKeyStatus> {
  const creds = await readAiCredentials(path);
  return { anthropic: !!creds.anthropic, openai: !!creds.openai };
}
