import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';

beforeEach(() => {
  useWorkspaceStore.setState({
    rootPath: null,
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: {},
  });
  useEditorStore.setState({ tabs: [], activePath: null });
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    openFolder: vi.fn(async () => ({
      ok: true,
      data: { rootPath: '/proj', tree: [{ name: 'a.ts', path: '/proj/a.ts', isDirectory: false }] },
    })),
    readFile: vi.fn(async () => ({ ok: true, data: 'file body' })),
    readDirectory: vi.fn(async () => ({ ok: true, data: [] })),
  };
});

describe('FileExplorer', () => {
  it('opens a folder and lists its entries', async () => {
    render(<FileExplorer />);
    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    await waitFor(() => expect(screen.getByText('a.ts')).toBeDefined());
  });

  it('clicking a file opens it as a tab', async () => {
    useWorkspaceStore.setState({
      rootPath: '/proj',
      rootEntries: [{ name: 'a.ts', path: '/proj/a.ts', isDirectory: false }],
    });
    render(<FileExplorer />);
    fireEvent.click(screen.getByText('a.ts'));
    await waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(1));
    expect(useEditorStore.getState().tabs[0].content).toBe('file body');
  });
});
