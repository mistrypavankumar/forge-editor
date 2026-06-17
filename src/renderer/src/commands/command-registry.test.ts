import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commandRegistry } from './command-registry';

beforeEach(() => {
  (commandRegistry as unknown as { commands: Map<string, unknown> }).commands.clear();
});

describe('command-registry', () => {
  it('registers and retrieves a command', () => {
    commandRegistry.register({ id: 'a', title: 'A', run: () => {} });
    expect(commandRegistry.get('a')?.title).toBe('A');
  });

  it('all() lists registered commands', () => {
    commandRegistry.register({ id: 'a', title: 'A', run: () => {} });
    commandRegistry.register({ id: 'b', title: 'B', run: () => {} });
    expect(commandRegistry.all().map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('run invokes the command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'a', title: 'A', run });
    await commandRegistry.run('a');
    expect(run).toHaveBeenCalledOnce();
  });

  it('run skips a disabled command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'a', title: 'A', run, isEnabled: () => false });
    await commandRegistry.run('a');
    expect(run).not.toHaveBeenCalled();
  });

  it('run on an unknown id is a no-op', async () => {
    await expect(commandRegistry.run('missing')).resolves.toBeUndefined();
  });
});
