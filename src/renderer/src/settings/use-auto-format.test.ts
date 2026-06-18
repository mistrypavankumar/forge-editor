import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoFormat } from './use-auto-format';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useWorkspaceStore } from '../stores/workspace-store';

const runFormatter = vi.fn(async () => ({ ok: true, data: { code: 0, stderr: '' } }));

beforeEach(() => {
  vi.useFakeTimers();
  runFormatter.mockClear();
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    writeFile: async () => ({ ok: true, data: undefined }),
    runFormatter,
    readFile: async () => ({ ok: true, data: 'formatted' }),
  };
  useWorkspaceStore.setState({ rootPath: '/proj' });
  useFormatterStore.setState({ autoFormat: true, selectedId: 'eslint', available: ['eslint'], lastError: null });
  useEditorStore.setState({
    tabs: [{ path: '/proj/a.ts', name: 'a.ts', content: 'x', dirty: true }],
    activePath: '/proj/a.ts',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoFormat', () => {
  it('formats the active file 5s after the last edit', async () => {
    renderHook(() => useAutoFormat());
    await vi.advanceTimersByTimeAsync(4999);
    expect(runFormatter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runFormatter).toHaveBeenCalledTimes(1);
  });

  it('does not run when auto-format is off', async () => {
    useFormatterStore.setState({ autoFormat: false });
    renderHook(() => useAutoFormat());
    await vi.advanceTimersByTimeAsync(6000);
    expect(runFormatter).not.toHaveBeenCalled();
  });

  it('does not run for a clean (unedited) file', async () => {
    useEditorStore.setState({
      tabs: [{ path: '/proj/a.ts', name: 'a.ts', content: 'x', dirty: false }],
      activePath: '/proj/a.ts',
    });
    renderHook(() => useAutoFormat());
    await vi.advanceTimersByTimeAsync(6000);
    expect(runFormatter).not.toHaveBeenCalled();
  });

  it('debounces: an edit before 5s resets the timer', async () => {
    const { rerender } = renderHook(() => useAutoFormat());
    await vi.advanceTimersByTimeAsync(3000);
    // Edit again — resets the debounce window.
    useEditorStore.getState().updateContent('/proj/a.ts', 'x2');
    rerender();
    await vi.advanceTimersByTimeAsync(4000);
    expect(runFormatter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runFormatter).toHaveBeenCalledTimes(1);
  });
});
