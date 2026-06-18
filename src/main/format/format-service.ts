import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { FormatRunResult, FormatTextResult } from '@shared/ipc-contract';

const pExecFile = promisify(execFile);

/** Reject anything that isn't a bare tool name — the renderer must not pass paths or flags here. */
function assertSafeTool(tool: string): void {
  if (!/^[a-z0-9._-]+$/i.test(tool)) {
    throw new Error(`Unsafe formatter name: ${tool}`);
  }
}

/** Locate a project-local formatter binary under node_modules/.bin. */
async function resolveBin(rootPath: string, tool: string): Promise<string> {
  const base = join(rootPath, 'node_modules', '.bin', tool);
  const candidates = process.platform === 'win32' ? [`${base}.cmd`, base] : [base];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`${tool} is not installed in this project (node_modules/.bin/${tool} not found)`);
}

/**
 * Run a project-local formatter CLI against a file. Resolves with the exit code and
 * stderr even when the tool exits non-zero (e.g. eslint reporting unfixable errors after
 * applying fixes); only a missing binary or unsafe input rejects.
 */
export async function runFormatter(
  rootPath: string,
  tool: string,
  args: string[],
): Promise<FormatRunResult> {
  assertSafeTool(tool);
  const bin = await resolveBin(rootPath, tool);
  const useShell = process.platform === 'win32' && bin.endsWith('.cmd');
  try {
    const { stderr } = await pExecFile(bin, args, {
      cwd: rootPath,
      shell: useShell,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stderr: stderr ?? '' };
  } catch (e) {
    const ex = e as { code?: number; stderr?: string; message?: string };
    return {
      code: typeof ex.code === 'number' ? ex.code : 1,
      stderr: ex.stderr ?? ex.message ?? '',
    };
  }
}

/**
 * Run a project-local formatter in stdin mode: pipe `input` in, capture formatted stdout.
 * Used for in-editor formatting (Monaco provider) so the buffer is formatted without
 * touching disk. Rejects only on a missing binary or unsafe input.
 */
export async function formatText(
  rootPath: string,
  tool: string,
  args: string[],
  input: string,
): Promise<FormatTextResult> {
  assertSafeTool(tool);
  const bin = await resolveBin(rootPath, tool);
  const useShell = process.platform === 'win32' && bin.endsWith('.cmd');
  return new Promise<FormatTextResult>((resolve) => {
    const child = spawn(bin, args, { cwd: rootPath, shell: useShell });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ stdout: '', stderr: e.message, code: 1 }));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    child.stdin.on('error', () => {
      /* ignore EPIPE if the tool exits before reading all input */
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}
