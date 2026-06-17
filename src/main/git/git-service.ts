import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import type { GitChange, SearchMatch } from '@shared/ipc-contract';

const run = promisify(execFile);

export async function getGitChanges(rootPath: string): Promise<GitChange[]> {
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'status', '--porcelain'], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const changes: GitChange[] = [];
    for (const raw of stdout.split('\n')) {
      if (!raw.trim()) continue;
      const code = raw.slice(0, 2);
      let p = raw.slice(3);
      if (code.includes('R') && p.includes(' -> ')) p = p.split(' -> ')[1];
      let status: GitChange['status'] = 'M';
      if (code === '??') status = 'U';
      else if (code.includes('A')) status = 'A';
      else if (code.includes('D')) status = 'D';
      else if (code.includes('R')) status = 'R';
      changes.push({ path: p, name: basename(p), status });
    }
    return changes;
  } catch {
    return [];
  }
}

export async function gitCommit(rootPath: string, message: string): Promise<void> {
  await run('git', ['-C', rootPath, 'add', '-A']);
  await run('git', ['-C', rootPath, 'commit', '-m', message]);
}

const MAX_MATCHES = 300;

export async function searchInFiles(rootPath: string, query: string): Promise<SearchMatch[]> {
  if (!query.trim()) return [];
  try {
    const { stdout } = await run(
      'git',
      ['-C', rootPath, 'grep', '-n', '-I', '-F', '-i', '--no-color', '--', query],
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
