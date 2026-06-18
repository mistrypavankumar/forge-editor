import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProjectDiagnostic } from '@shared/ipc-contract';

const pExecFile = promisify(execFile);
const MAX_DIAGNOSTICS = 5000;

/** Parse `tsc --noEmit --pretty false` output into structured diagnostics. */
export function parseTscOutput(output: string): ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = [];
  // e.g. "src/foo.ts(11,3): error TS2322: Type '...' is not assignable..."
  const line = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  for (const raw of output.split(/\r?\n/)) {
    if (diagnostics.length >= MAX_DIAGNOSTICS) break;
    const m = line.exec(raw);
    if (!m) continue; // continuation/related lines are indented and ignored
    diagnostics.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4] as 'error' | 'warning',
      code: m[5],
      message: m[6],
    });
  }
  return diagnostics;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/** Run the project's TypeScript compiler in no-emit mode and return all diagnostics. */
export async function runDiagnostics(rootPath: string): Promise<ProjectDiagnostic[]> {
  const bin = join(rootPath, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  if (!(await exists(bin))) {
    throw new Error('TypeScript (tsc) is not installed in this project.');
  }
  const args = ['--noEmit', '--pretty', 'false'];
  if (await exists(join(rootPath, 'tsconfig.json'))) args.push('-p', 'tsconfig.json');

  // tsc writes diagnostics to stdout and exits non-zero when problems exist.
  try {
    const { stdout } = await pExecFile(bin, args, { cwd: rootPath, maxBuffer: 64 * 1024 * 1024 });
    return parseTscOutput(stdout);
  } catch (e) {
    const ex = e as { stdout?: string };
    if (typeof ex.stdout === 'string') return parseTscOutput(ex.stdout);
    throw e;
  }
}
