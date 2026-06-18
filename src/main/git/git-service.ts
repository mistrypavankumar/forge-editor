import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, relative, sep } from 'node:path';
import type { BlameLine, GitChange } from '@shared/ipc-contract';

const run = promisify(execFile);

/** `git show <ref>:<relpath>`, or null when the path isn't resolvable at that ref. */
async function gitShow(rootPath: string, filePath: string, ref: string): Promise<string | null> {
  const rel = relative(rootPath, filePath).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'show', `${ref}:${rel}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * The committed (HEAD) content of a file, or null when it isn't tracked
 * (new/untracked files, or paths outside a repo). Used to diff the gutter.
 */
export function getGitOriginalContent(rootPath: string, filePath: string): Promise<string | null> {
  return gitShow(rootPath, filePath, 'HEAD');
}

/** The staged (index) content of a file — what a commit would record right now. */
export function getGitStagedContent(rootPath: string, filePath: string): Promise<string | null> {
  return gitShow(rootPath, filePath, '');
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

/**
 * Of the given entry names (relative to `dirPath`), the subset matched by a
 * .gitignore rule. Empty when `dirPath` isn't in a git repo.
 */
export async function getIgnoredNames(dirPath: string, names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  try {
    // check-ignore echoes each matched pathspec (one per line); -z is stdin-only.
    const { stdout } = await run('git', ['-C', dirPath, 'check-ignore', '--', ...names], {
      maxBuffer: 4 * 1024 * 1024,
    });
    return new Set(stdout.split('\n').filter(Boolean));
  } catch {
    // exit 1 = none ignored; exit 128 = not a repo. Either way: nothing to dim.
    return new Set();
  }
}

const BLAME_HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;

/** Parse `git blame --porcelain` output into per-line author/time (1-based index). */
function parseBlame(stdout: string): BlameLine[] {
  const commits = new Map<string, { author: string; time: number }>();
  const result: BlameLine[] = [];
  let sha = '';
  let finalLine = 0;
  let author: string | undefined;
  let time: number | undefined;

  for (const line of stdout.split('\n')) {
    const header = BLAME_HEADER.exec(line);
    if (header) {
      sha = header[1];
      finalLine = Number(header[2]);
      author = undefined;
      time = undefined;
    } else if (line.startsWith('author ')) {
      author = line.slice('author '.length);
    } else if (line.startsWith('author-time ')) {
      time = Number(line.slice('author-time '.length));
    } else if (line.startsWith('\t')) {
      // The content line closes a group; commit info is cached per sha (repeats omit it).
      let info = commits.get(sha);
      if (!info) {
        info = { author: author ?? 'Unknown', time: time ?? 0 };
        commits.set(sha, info);
      }
      result[finalLine - 1] = /^0{40}$/.test(sha)
        ? { author: 'You', time: null }
        : { author: info.author, time: info.time };
    }
  }
  return result;
}

/** Per-line blame for a file; empty when the file isn't tracked or not in a repo. */
export async function getGitBlame(rootPath: string, filePath: string): Promise<BlameLine[]> {
  const rel = relative(rootPath, filePath).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return [];
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'blame', '--porcelain', '--', rel], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return parseBlame(stdout);
  } catch {
    return [];
  }
}

