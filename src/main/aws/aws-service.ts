import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AwsActive, AwsConfigPaths, AwsProfile, AwsValidation } from '@shared/ipc-contract';
import { parseIni } from '../aws/ini';

const run = promisify(execFile);

const CONFIG_PATH = join(homedir(), '.aws', 'config');
const CREDENTIALS_PATH = join(homedir(), '.aws', 'credentials');

/** Display labels for the source files, mirroring the AWS Toolkit wording. */
const CONFIG_LABEL = '~/.aws/config';
const CREDENTIALS_LABEL = '~/.aws/credentials';

export function awsConfigPaths(): AwsConfigPaths {
  return { config: CONFIG_PATH, credentials: CREDENTIALS_PATH };
}

async function readIniFile(path: string): Promise<ReturnType<typeof parseIni>> {
  try {
    return parseIni(await readFile(path, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Discover credential profiles from ~/.aws/config and ~/.aws/credentials.
 * In config, profiles are `[profile NAME]` (plus a bare `[default]`); `[sso-session ...]`
 * blocks are skipped. Profiles in credentials are long-lived IAM keys. A profile present
 * in both files is reported once, preferring the config entry (richer metadata).
 */
export async function listProfiles(): Promise<AwsProfile[]> {
  const [config, credentials] = await Promise.all([
    readIniFile(CONFIG_PATH),
    readIniFile(CREDENTIALS_PATH),
  ]);

  const byName = new Map<string, AwsProfile>();

  for (const { name, values } of config) {
    if (name === 'default') {
      byName.set('default', toProfile('default', values, CONFIG_LABEL));
    } else if (name.startsWith('profile ')) {
      const profileName = name.slice('profile '.length).trim();
      if (profileName) byName.set(profileName, toProfile(profileName, values, CONFIG_LABEL));
    }
    // `sso-session NAME` and anything else is intentionally ignored.
  }

  for (const { name, values } of credentials) {
    if (byName.has(name)) continue;
    byName.set(name, toProfile(name, values, CREDENTIALS_LABEL));
  }

  return [...byName.values()];
}

function toProfile(
  name: string,
  values: Record<string, string>,
  source: string,
): AwsProfile {
  const isSso = Boolean(values.sso_session || values.sso_start_url || values.sso_account_id);
  return {
    name,
    kind: isSso ? 'sso' : 'iam',
    source,
    region: values.region,
  };
}

/**
 * Probe a profile's credentials with `aws sts get-caller-identity`. Resolves a structured
 * result; never throws — an invalid/expired/SSO-logged-out profile resolves `{ valid: false }`.
 */
export async function validateProfile(name: string): Promise<AwsValidation> {
  try {
    const { stdout } = await run(
      'aws',
      ['sts', 'get-caller-identity', '--profile', name, '--output', 'json'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { Account?: string };
    return { valid: true, accountId: parsed.Account };
  } catch (err) {
    return { valid: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  const stderr = (err as { stderr?: string })?.stderr;
  if (typeof stderr === 'string' && stderr.trim()) {
    // Surface the first meaningful line of the CLI error.
    return stderr.trim().split(/\r?\n/)[0];
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

// ---- Active connection (injected into spawned terminals/run-tasks) ----------

let activeProfile: string | null = null;
let activeRegion: string | null = null;

export function setActiveProfile(profile: string | null, region: string | null = null): void {
  activeProfile = profile && profile.trim() ? profile : null;
  activeRegion = region && region.trim() ? region : null;
}

export function getActiveProfile(): AwsActive {
  return { profile: activeProfile, region: activeRegion };
}

/** Environment overrides for newly-spawned shells when a connection is active. */
export function getActiveAwsEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (activeProfile) env.AWS_PROFILE = activeProfile;
  if (activeRegion) {
    env.AWS_REGION = activeRegion;
    env.AWS_DEFAULT_REGION = activeRegion;
  }
  return env;
}
