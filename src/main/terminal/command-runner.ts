import { spawn, type ChildProcess } from 'node:child_process';
import type { WebContents } from 'electron';
import { IpcChannels, type TerminalRunArgs } from '@shared/ipc-contract';

const processes = new Map<string, ChildProcess>();

export function runCommand(sender: WebContents, args: TerminalRunArgs): void {
  // One process per terminal id — replace any existing one.
  processes.get(args.id)?.kill();

  const child = spawn(args.command, {
    shell: true,
    cwd: args.cwd ?? process.cwd(),
    // The child is piped (not a TTY), so most CLIs disable color. Force it on —
    // these are honored by chalk/Next.js/npm/git/ls etc. even without a real PTY.
    env: {
      ...process.env,
      FORCE_COLOR: '3',
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color',
      CLICOLOR: '1',
      CLICOLOR_FORCE: '1',
    },
  });
  processes.set(args.id, child);

  const send = (chunk: string): void => {
    if (!sender.isDestroyed()) sender.send(IpcChannels.terminalData, { id: args.id, chunk });
  };

  child.stdout?.on('data', (d: Buffer) => send(d.toString()));
  child.stderr?.on('data', (d: Buffer) => send(d.toString()));
  child.on('error', (e) => send(`\r\n${e.message}\r\n`));
  child.on('exit', (code) => {
    processes.delete(args.id);
    if (!sender.isDestroyed()) {
      sender.send(IpcChannels.terminalExit, { id: args.id, code: code ?? 0 });
    }
  });
}

export function killCommand(id: string): void {
  processes.get(id)?.kill();
  processes.delete(id);
}
