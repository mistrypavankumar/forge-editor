import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, relative, sep } from 'node:path';
import type { GitChange, SearchMatch } from '@shared/ipc-contract';

const run = promisify(execFile);

/**
 * The committed (HEAD) content of a file, or null when it isn't tracked
 * (new/untracked files, or paths outside a repo). Used to diff the gutter.
 */
export async function getGitOriginalContent(
  rootPath: string,
  filePath: string,
): Promise<string | null> {
  const rel = relative(rootPath, filePath).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'show', `HEAD:${rel}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function getGitChanges(rootPath: string): Promise<GitChange[]> {
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'status', '--porcelain'], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const changes: GitChange[] = [];
    for (const raw of stdout.split('\n')) {
      if (!raw.trim()) continue;
      const x = raw[0];
      const y = raw[1];
      let p = raw.slice(3);
      if (raw.slice(0, 2).includes('R') && p.includes(' -> ')) p = p.split(' -> ')[1];
      const untracked = x === '?' && y === '?';
      const staged = !untracked && x !== ' ';
      const unstaged = untracked || y !== ' ';
      const code = untracked ? '?' : unstaged ? y : x;
      const status: GitChange['status'] =
        code === 'A' ? 'A' : code === 'D' ? 'D' : code === 'R' ? 'R' : code === '?' ? 'U' : 'M';
      changes.push({ path: p, name: basename(p), status, staged, unstaged });
    }
    return changes;
  } catch {
    return [];
  }
}

export async function gitStage(rootPath: string, path: string): Promise<void> {
  await run('git', ['-C', rootPath, 'add', '--', path]);
}

export async function gitUnstage(rootPath: string, path: string): Promise<void> {
  await run('git', ['-C', rootPath, 'reset', '-q', 'HEAD', '--', path]);
}

export async function gitDiscard(rootPath: string, path: string): Promise<void> {
  await run('git', ['-C', rootPath, 'checkout', '--', path]);
}

export async function gitStageAll(rootPath: string): Promise<void> {
  await run('git', ['-C', rootPath, 'add', '-A']);
}

export async function gitCommit(rootPath: string, message: string): Promise<void> {
  // Commit staged changes; if nothing is staged, stage everything first (VS Code-style).
  let nothingStaged = false;
  try {
    await run('git', ['-C', rootPath, 'diff', '--cached', '--quiet']);
    nothingStaged = true; // exit 0 = no staged changes
  } catch {
    nothingStaged = false; // exit 1 = staged changes exist
  }
  if (nothingStaged) await run('git', ['-C', rootPath, 'add', '-A']);
  await run('git', ['-C', rootPath, 'commit', '-m', message]);
}

const MAX_MATCHES = 300;

export async function searchInFiles(rootPath: string, query: string): Promise<SearchMatch[]> {
  if (!query.trim()) return [];
  try {
    const { stdout } = await run(
      'git',
      // --untracked: also search new files, but git grep always skips .gitignore'd paths.
      ['-C', rootPath, 'grep', '-n', '-I', '-F', '-i', '--no-color', '--untracked', '--', query],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const matches: SearchMatch[] = [];
    for (const line of stdout.split('\n')) {
      if (matches.length >= MAX_MATCHES) break;
      const i1 = line.indexOf(':');
      const i2 = line.indexOf(':', i1 + 1);
      if (i1 < 0 || i2 < 0) continue;
      const path = line.slice(0, i1);
      const ln = Number(line.slice(i1 + 1, i2));
      if (!Number.isFinite(ln)) continue;
      matches.push({ path, name: basename(path), line: ln, preview: line.slice(i2 + 1).slice(0, 200) });
    }
    return matches;
  } catch {
    // git grep exits non-zero when there are no matches (or not a repo).
    return [];
  }
}
