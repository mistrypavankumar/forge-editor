import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import type { GitChange } from '@shared/ipc-contract';

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
