type ExecFn = (command: string) => void;

// Lets the toolbar (task buttons) run a command in a specific terminal session.
const registry = new Map<string, ExecFn>();

export function registerExec(id: string, fn: ExecFn): void {
  registry.set(id, fn);
}

export function unregisterExec(id: string): void {
  registry.delete(id);
}

export function runInTerminal(id: string, command: string): void {
  registry.get(id)?.(command);
}
