import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * GUI-launched builds (Finder / launchd / Dock) inherit only the bare system PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin) — Homebrew's /opt/homebrew/bin and dirs added by
 * shell profiles are missing. Tools we shell out to from the main process (notably
 * `gh`, which the git-user switcher uses) live there, so `execFile('gh', ...)` fails
 * with ENOENT and the GitHub importer silently shows nothing. Capture the PATH a login
 * shell produces and fold it into the main-process env so every spawn can find
 * user-installed tools — the same fix the integrated terminal already gets by spawning
 * login shells (see terminal/command-runner.ts). Best-effort and idempotent.
 */
export async function hydratePathFromLoginShell(): Promise<void> {
  if (process.platform === 'win32') return;
  const shell = process.env.SHELL ?? '/bin/zsh';
  try {
    // `-ilc` so the shell sources its login + interactive profiles (~/.zprofile,
    // ~/.zshrc) where `brew shellenv` and version managers put their bin dirs. Wrap
    // the value in sentinels so we can parse it even if the profile prints to stdout.
    const { stdout } = await run(
      shell,
      ['-ilc', 'printf "__FORGE_PATH__%s__FORGE_PATH__" "$PATH"'],
      { timeout: 5000 },
    );
    const shellPath = /__FORGE_PATH__(.*)__FORGE_PATH__/s.exec(stdout)?.[1]?.trim();
    if (!shellPath) return;

    const merged = process.env.PATH ? process.env.PATH.split(':') : [];
    for (const dir of shellPath.split(':')) {
      if (dir && !merged.includes(dir)) merged.push(dir);
    }
    process.env.PATH = merged.join(':');
  } catch {
    // If the shell probe fails (no shell, profile errors, timeout), keep the inherited PATH.
  }
}
