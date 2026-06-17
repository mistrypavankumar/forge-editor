import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./EditorPane', () => ({ EditorPane: () => null }));

beforeAll(() => {
  (window as unknown as { forge: { ping: (m: string) => Promise<string> } }).forge = {
    ping: async (m) => `pong: ${m}`,
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
