import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { upsertBlock, removeBlock, hasBlock, profilePathForShell } from './shell-profile';

export interface IntegrationPaths {
  home: string;
  binDir: string;
  shimPath: string;
  profilePath: string;
  appBundle: string;
}

export const PHASE1_ENV_LINES = [
  'export PATH="$HOME/.local/bin:$PATH"',
  'export REACT_EDITOR=forge',
  'export LAUNCH_EDITOR=forge',
];

export function resolveIntegrationPaths(
  home: string,
  shell: string | undefined,
  appBundle: string,
): IntegrationPaths {
  const binDir = join(home, '.local', 'bin');
  return {
    home,
    binDir,
    shimPath: join(binDir, 'forge'),
    profilePath: profilePathForShell(shell, home),
    appBundle,
  };
}

/** Phase 1 shim: non-blocking open via the macOS app association (routes through `open-file`). */
export function buildShim(appBundle: string): string {
  return [
    '#!/bin/sh',
    '# Forge editor integration. Opens files passed by $EDITOR / REACT_EDITOR / etc.',
    '# Phase 1: non-blocking open via the macOS app association.',
    `exec open -a "${appBundle}" "$@"`,
    '',
  ].join('\n');
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return '';
  }
}

export async function install(paths: IntegrationPaths, envLines = PHASE1_ENV_LINES): Promise<void> {
  await fs.mkdir(paths.binDir, { recursive: true });
  await fs.writeFile(paths.shimPath, buildShim(paths.appBundle), { mode: 0o755 });
  await fs.chmod(paths.shimPath, 0o755);
  const current = await readOrEmpty(paths.profilePath);
  await fs.writeFile(paths.profilePath, upsertBlock(current, envLines), 'utf8');
}

export async function uninstall(paths: IntegrationPaths): Promise<void> {
  await fs.rm(paths.shimPath, { force: true });
  const current = await readOrEmpty(paths.profilePath);
  if (current) await fs.writeFile(paths.profilePath, removeBlock(current), 'utf8');
}

export async function status(paths: IntegrationPaths): Promise<{ installed: boolean }> {
  const shimExists = await fs
    .stat(paths.shimPath)
    .then(() => true)
    .catch(() => false);
  const profile = await readOrEmpty(paths.profilePath);
  return { installed: shimExists && hasBlock(profile) };
}
