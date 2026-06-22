type ExecFn = (command: string) => void;

// Lets the toolbar (task buttons) run a command in a specific terminal session.
const registry = new Map<string, ExecFn>();
// Commands targeted at a session whose TerminalView hasn't mounted/registered yet
// (e.g. a brand-new terminal created for a task). Flushed in order once it registers.
const queued = new Map<string, string[]>();

export function registerExec(id: string, fn: ExecFn): void {
  registry.set(id, fn);
  const pending = queued.get(id);
  if (pending) {
    queued.delete(id);
    for (const command of pending) fn(command);
  }
}

export function unregisterExec(id: string): void {
  registry.delete(id);
  queued.delete(id);
}

export function runInTerminal(id: string, command: string): void {
  const fn = registry.get(id);
  if (fn) {
    fn(command);
    return;
  }
  const pending = queued.get(id);
  if (pending) pending.push(command);
  else queued.set(id, [command]);
}
