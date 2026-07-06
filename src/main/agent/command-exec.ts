import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentCommandResult, AgentRunCommandArgs } from '@shared/ipc-contract';
import { getActiveAwsEnv } from '../aws/aws-service';

/**
 * Captured-output command runner for the AI Agent's "Run Checks" step (and, later, the
 * error-to-fix workflow). Unlike the interactive PTY terminals, this spawns a one-shot process,
 * buffers its stdout/stderr, and resolves with the exit code — so the agent can read the output and
 * summarize failures. Commands run through a login shell (full PATH, like the terminals) with the
 * active AWS profile injected, and are hard-killed after a timeout.
 */

/** In-flight commands by id, so {@link cancelAgentCommand} can kill the right one. */
const running = new Map<string, ChildProcess>();

const DEFAULT_TIMEOUT_MS = 120_000;
/** Cap on captured stdout/stderr; we keep the tail (where errors and summaries live). */
const MAX_CAPTURE = 200_000;

function loginShell(): { shell: string; flag: string } {
  if (process.platform === 'win32') return { shell: process.env.COMSPEC ?? 'cmd.exe', flag: '/c' };
  // -l sources login profiles (Homebrew PATH etc.); -c runs the command string. Mirrors the PTY.
  return { shell: process.env.SHELL ?? '/bin/zsh', flag: '-lc' };
}

function keepTail(s: string): string {
  return s.length > MAX_CAPTURE ? s.slice(s.length - MAX_CAPTURE) : s;
}

export function runAgentCommand(args: AgentRunCommandArgs): Promise<AgentCommandResult> {
  return new Promise((resolve) => {
    const { shell, flag } = loginShell();
    const startedAt = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(shell, [flag, args.command], {
        cwd: args.cwd,
        env: { ...process.env, ...getActiveAwsEnv() },
      });
    } catch (e) {
      resolve({
        command: args.command,
        exitCode: null,
        stdout: '',
        stderr: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
        timedOut: false,
      });
      return;
    }

    running.set(args.id, child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout?.on('data', (d: Buffer) => {
      stdout = keepTail(stdout + d.toString());
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr = keepTail(stderr + d.toString());
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(args.id);
      resolve({
        command: args.command,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };

    child.on('error', (e) => {
      stderr = keepTail(stderr + (e instanceof Error ? e.message : String(e)));
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** Kill an in-flight agent command by id (no-op if it already finished). */
export function cancelAgentCommand(id: string): void {
  running.get(id)?.kill('SIGKILL');
  running.delete(id);
}
