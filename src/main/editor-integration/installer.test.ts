import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveIntegrationPaths,
  buildShim,
  install,
  uninstall,
  status,
  PHASE1_ENV_LINES,
} from './installer';

let home: string;
const APP = '/Applications/Forge.app';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'forge-home-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('buildShim', () => {
  it('opens the bundle via the macOS association, passing args through', () => {
    const shim = buildShim(APP);
    expect(shim.startsWith('#!/bin/sh\n')).toBe(true);
    expect(shim).toContain(`open -a "${APP}" "$@"`);
  });
});

describe('install/status/uninstall', () => {
  it('writes an executable shim and the profile block, reported installed', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);

    const shimStat = await fs.stat(paths.shimPath);
    expect(shimStat.mode & 0o111).not.toBe(0); // executable bit set

    const profile = await fs.readFile(paths.profilePath, 'utf8');
    for (const line of PHASE1_ENV_LINES) expect(profile).toContain(line);

    expect((await status(paths)).installed).toBe(true);
  });

  it('is idempotent — installing twice leaves one block', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);
    await install(paths);
    const profile = await fs.readFile(paths.profilePath, 'utf8');
    expect(profile.match(/forge editor integration >>>/g)?.length).toBe(1);
  });

  it('uninstall removes the shim and the block', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);
    await uninstall(paths);
    await expect(fs.stat(paths.shimPath)).rejects.toThrow();
    expect((await status(paths)).installed).toBe(false);
  });
});
