import { createRequire } from 'node:module';
import type { IPty } from 'node-pty';
import type { WebContents } from 'electron';
import { IpcChannels, type TerminalCreateArgs } from '@shared/ipc-contract';

// node-pty is a native CJS addon kept external from the bundle; load via require.
const require = createRequire(import.meta.url);
const pty = require('node-pty') as typeof import('node-pty');

const sessions = new Map<string, IPty>();

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/zsh';
}

export function createTerminal(sender: WebContents, args: TerminalCreateArgs): void {
  sessions.get(args.id)?.kill();

  const proc = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols: Math.max(args.cols, 2),
    rows: Math.max(args.rows, 1),
    cwd: args.cwd ?? process.env.HOME ?? process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });
  sessions.set(args.id, proc);

  proc.onData((chunk) => {
    if (!sender.isDestroyed()) sender.send(IpcChannels.terminalData, { id: args.id, chunk });
  });
  proc.onExit(({ exitCode }) => {
    sessions.delete(args.id);
    if (!sender.isDestroyed()) {
      sender.send(IpcChannels.terminalExit, { id: args.id, code: exitCode });
    }
  });
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
}
