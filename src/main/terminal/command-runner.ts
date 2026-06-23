import { createRequire } from 'node:module';
import type { IPty } from 'node-pty';
import type { WebContents } from 'electron';
import { IpcChannels, type TerminalCreateArgs } from '@shared/ipc-contract';
import { getActiveAwsEnv } from '../aws/aws-service';

// node-pty is a native CJS addon kept external from the bundle; load via require.
const require = createRequire(import.meta.url);
const pty = require('node-pty') as typeof import('node-pty');

const sessions = new Map<string, IPty>();
/** Per-session foreground-process pollers (drive the task "running" indicator). */
const pollers = new Map<string, ReturnType<typeof setInterval>>();
const BUSY_POLL_MS = 400;

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/zsh';
}

function shellName(): string {
  return (defaultShell().split('/').pop() ?? 'sh').replace(/^-/, '');
}

// Spawn POSIX shells as login shells (-l) so they source ~/.zprofile / ~/.zlogin
// (or ~/.bash_profile). That's where Homebrew's `brew shellenv` puts /opt/homebrew/bin
// on PATH. Without -l, a GUI-launched build (Finder/launchd) only gets the bare system
// PATH and tools like starship/brew aren't found — even though .zshrc still sources.
function shellArgs(): string[] {
  if (process.platform === 'win32') return [];
  return ['-l'];
}

function stopPoller(id: string): void {
  const t = pollers.get(id);
  if (t) {
    clearInterval(t);
    pollers.delete(id);
  }
}

export function createTerminal(sender: WebContents, args: TerminalCreateArgs): void {
  sessions.get(args.id)?.kill();

  const proc = pty.spawn(defaultShell(), shellArgs(), {
    name: 'xterm-256color',
    cols: Math.max(args.cols, 2),
    rows: Math.max(args.rows, 1),
    cwd: args.cwd ?? process.env.HOME ?? process.cwd(),
    // getActiveAwsEnv() injects AWS_PROFILE/region for the active connection, so terminals
    // and run-tasks (which write into ptys created here) use the chosen profile.
    env: {
      ...process.env,
      ...getActiveAwsEnv(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });
  sessions.set(args.id, proc);

  proc.onData((chunk) => {
    if (!sender.isDestroyed()) sender.send(IpcChannels.terminalData, { id: args.id, chunk });
  });
  proc.onExit(({ exitCode }) => {
    // Only clear the map if this is still the active pty for the id — a fast
    // re-create (e.g. React StrictMode remount) may have replaced it already.
    if (sessions.get(args.id) === proc) {
      sessions.delete(args.id);
      stopPoller(args.id);
      if (!sender.isDestroyed()) {
        sender.send(IpcChannels.terminalExit, { id: args.id, code: exitCode });
      }
    }
  });

  // Watch the foreground process so the UI can show a task as running and clear it the moment
  // the command returns to the shell (finished, failed, or interrupted). Emit only on change;
  // the initial idle state is never emitted, so the first event a task sees is "busy".
  const shell = shellName();
  let busy = false;
  let lastProc = '';
  const poll = setInterval(() => {
    if (sessions.get(args.id) !== proc) return;
    let fg = '';
    try {
      fg = proc.process;
    } catch {
      fg = '';
    }
    const name = fg.replace(/^-/, '');
    const next = name !== '' && name !== shell;
    // Emit when busy-state flips OR the foreground process name changes, so the tab
    // title tracks the running program (vim, node, claude…) and reverts to the shell.
    if (next !== busy || name !== lastProc) {
      busy = next;
      lastProc = name;
      if (!sender.isDestroyed()) {
        sender.send(IpcChannels.terminalBusy, { id: args.id, busy, proc: name });
      }
    }
  }, BUSY_POLL_MS);
  pollers.set(args.id, poll);
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  try {
    sessions.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 1));
  } catch {
    // resize can throw if the pty is mid-teardown; ignore.
  }
}

export function killTerminal(id: string): void {
  sessions.get(id)?.kill();
  sessions.delete(id);
  stopPoller(id);
}
