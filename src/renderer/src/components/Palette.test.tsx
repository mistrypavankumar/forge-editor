import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Palette } from './Palette';
import { usePaletteStore } from '../stores/palette-store';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { commandRegistry } from '../commands/command-registry';

beforeEach(() => {
  (commandRegistry as unknown as { commands: Map<string, unknown> }).commands.clear();
  useEditorStore.setState({ tabs: [], activePath: null });
  useWorkspaceStore.setState({
    rootPath: '/proj',
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: {},
  });
  usePaletteStore.setState({ open: false, mode: 'commands' });
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    listFiles: vi.fn(async () => ({
      ok: true,
      data: [{ name: 'main.ts', path: '/proj/src/main.ts', relPath: 'src/main.ts' }],
    })),
    readFile: vi.fn(async () => ({ ok: true, data: 'body' })),
  };
});

describe('Palette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Palette />);
    expect(container.firstChild).toBeNull();
  });

  it('filters and runs a command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'x.do', title: 'Do The Thing', run });
    usePaletteStore.setState({ open: true, mode: 'commands' });
    render(<Palette />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), {
      target: { value: 'do thing' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/type a command/i), { key: 'Enter' });
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(usePaletteStore.getState().open).toBe(false);
  });

  it('quick-open lists files and opens the selection', async () => {
    usePaletteStore.setState({ open: true, mode: 'files' });
    render(<Palette />);
    await waitFor(() => expect(screen.getByText('main.ts')).toBeDefined());
    fireEvent.keyDown(screen.getByPlaceholderText(/go to file/i), { key: 'Enter' });
    await waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(1));
  });
});
