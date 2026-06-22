// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Build a fake $HOME/.aws with the given config + credentials contents. */
function setupHome(config: string, credentials: string): string {
  const home = mkdtempSync(join(tmpdir(), 'forge-aws-'));
  mkdirSync(join(home, '.aws'), { recursive: true });
  writeFileSync(join(home, '.aws', 'config'), config);
  writeFileSync(join(home, '.aws', 'credentials'), credentials);
  return home;
}

const ORIGINAL_HOME = process.env.HOME;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
});

describe('listProfiles', () => {
  it('discovers config + credentials profiles, classifies kind, and skips sso-session', async () => {
    process.env.HOME = setupHome(
      `[default]
region = us-east-1

[sso-session corp]
sso_start_url = https://example.awsapps.com/start

[profile Dev]
sso_session = corp
sso_account_id = 111111111111
region = us-west-2
`,
      `[default]
aws_access_key_id = AKIA000
aws_secret_access_key = secret

[LegacyKeys]
aws_access_key_id = AKIA111
aws_secret_access_key = secret
`,
    );

    const { listProfiles } = await import('./aws-service');
    const profiles = await listProfiles();
    const byName = Object.fromEntries(profiles.map((p) => [p.name, p]));

    // default comes from config (IAM, no sso markers), Dev is SSO, LegacyKeys only in credentials.
    expect(Object.keys(byName).sort()).toEqual(['Dev', 'LegacyKeys', 'default']);
    expect(byName.default).toMatchObject({ kind: 'iam', source: '~/.aws/config', region: 'us-east-1' });
    expect(byName.Dev).toMatchObject({ kind: 'sso', source: '~/.aws/config', region: 'us-west-2' });
    expect(byName.LegacyKeys).toMatchObject({ kind: 'iam', source: '~/.aws/credentials' });
    // The sso-session block must not surface as a profile.
    expect(byName.corp).toBeUndefined();
  });

  it('returns an empty list when no config files exist', async () => {
    const home = mkdtempSync(join(tmpdir(), 'forge-aws-'));
    process.env.HOME = home;
    const { listProfiles } = await import('./aws-service');
    expect(await listProfiles()).toEqual([]);
  });
});

describe('active connection env', () => {
  it('injects AWS_PROFILE and region only when set', async () => {
    process.env.HOME = setupHome('', '');
    const { setActiveProfile, getActiveAwsEnv } = await import('./aws-service');

    setActiveProfile(null);
    expect(getActiveAwsEnv()).toEqual({});

    setActiveProfile('Dev', 'eu-west-1');
    expect(getActiveAwsEnv()).toEqual({
      AWS_PROFILE: 'Dev',
      AWS_REGION: 'eu-west-1',
      AWS_DEFAULT_REGION: 'eu-west-1',
    });

    setActiveProfile('Dev', null);
    expect(getActiveAwsEnv()).toEqual({ AWS_PROFILE: 'Dev' });
  });
});
