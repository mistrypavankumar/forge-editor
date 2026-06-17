import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { useWorkspaceStore } from '../stores/workspace-store';

vi.mock('./CodeEditor', () => ({ CodeEditor: () => null }));
vi.mock('./BottomPanel', () => ({ BottomPanel: () => null }));

beforeAll(() => {
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    ping: async (m: string) => `pong: ${m}`,
    loadSettings: async () => ({ ok: true, data: {} }),
    saveSettings: async () => ({ ok: true, data: undefined }),
    openFolder: async () => ({ ok: true, data: null }),
    openFileDialog: async () => ({ ok: true, data: null }),
    listFiles: async () => ({ ok: true, data: [] }),
  };
});

beforeEach(() => {
  // A workspace is present, so the panels (not the Landing) render.
  useWorkspaceStore.setState({ rootPath: '/proj', rootEntries: [] });
});

describe('AppShell', () => {
  it('renders the sidebar, editor, and statusbar regions', () => {
    render(<AppShell />);
    expect(screen.getByTestId('sidebar-region')).toBeDefined();
    expect(screen.getByTestId('editor-region')).toBeDefined();
    expect(screen.getByTestId('statusbar-region')).toBeDefined();
  });
});
