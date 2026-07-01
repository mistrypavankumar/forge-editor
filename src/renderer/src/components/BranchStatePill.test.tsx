import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchStatePill } from './BranchStatePill';
import { useWorkspaceStore } from '../stores/workspace-store';

/** The invisible full-screen backdrop behind the create-branch popover. */
const backdrop = (): Element | null => document.querySelector('.fixed.inset-0.z-40');

beforeEach(() => {
  useWorkspaceStore.setState({
    rootPath: '/proj',
    branch: 'main',
    changeCount: 0,
    ahead: 0,
    behind: 0,
    hasUpstream: true,
    baseBehind: 0,
    base: null,
    syncTick: 0,
  });
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    isMac: true,
    gitBranches: vi.fn(async () => ({
      ok: true,
      data: { current: 'main', all: ['main', 'feature'], defaultBranch: 'main' },
    })),
  };
});

/** Open the pill's branch menu, then the "Create new branch…" popover + backdrop. */
async function openCreatePopover(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /click to switch/i }));
  fireEvent.click(await screen.findByText(/create new branch/i));
  await waitFor(() => expect(screen.getByPlaceholderText('new-branch-name')).toBeDefined());
  expect(backdrop()).not.toBeNull();
}

describe('BranchStatePill create-branch backdrop', () => {
  it('dismisses on right-click — the frozen-editor regression', async () => {
    render(<BranchStatePill />);
    await openCreatePopover();

    // A right-click on the invisible backdrop must tear it down (previously a no-op, which left
    // it swallowing every click/right-click in the window).
    fireEvent.contextMenu(backdrop()!);

    await waitFor(() => expect(screen.queryByPlaceholderText('new-branch-name')).toBeNull());
    expect(backdrop()).toBeNull();
  });

  it('dismisses on Escape even when the input is not focused', async () => {
    render(<BranchStatePill />);
    await openCreatePopover();

    // Move focus off the input, then Escape at the window level should still close it.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByPlaceholderText('new-branch-name')).toBeNull());
    expect(backdrop()).toBeNull();
  });

  it('does not orphan the backdrop when the workspace changes', async () => {
    render(<BranchStatePill />);
    await openCreatePopover();

    // Switching repos out from under an open popover must clear it, not leave the backdrop up.
    act(() => useWorkspaceStore.setState({ rootPath: '/other' }));

    await waitFor(() => expect(backdrop()).toBeNull());
  });
});
