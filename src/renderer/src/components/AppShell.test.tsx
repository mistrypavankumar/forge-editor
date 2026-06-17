import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./CodeEditor', () => ({ CodeEditor: () => null }));

beforeAll(() => {
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    ping: async (m: string) => `pong: ${m}`,
    loadSettings: async () => ({ ok: true, data: {} }),
    saveSettings: async () => ({ ok: true, data: undefined }),
  };
});

describe('AppShell', () => {
  it('renders the sidebar, editor, and statusbar regions', () => {
    render(<AppShell />);
    expect(screen.getByTestId('sidebar-region')).toBeDefined();
    expect(screen.getByTestId('editor-region')).toBeDefined();
    expect(screen.getByTestId('statusbar-region')).toBeDefined();
  });
});
