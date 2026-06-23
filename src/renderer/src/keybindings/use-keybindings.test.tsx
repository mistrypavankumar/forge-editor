import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeybindings } from './use-keybindings';
import { commandRegistry } from '../commands/command-registry';

function pressShift(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
}

describe('useKeybindings — double-Shift Go to File', () => {
  beforeEach(() => {
    (window as unknown as { forge: { isMac: boolean } }).forge = { isMac: false };
    vi.spyOn(commandRegistry, 'run').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens Go to File on two quick Shift taps', () => {
    renderHook(() => useKeybindings());
    pressShift();
    pressShift();
    expect(commandRegistry.run).toHaveBeenCalledWith('workbench.quickOpen');
  });

  it('does not trigger when a key is pressed between the Shift taps', () => {
    renderHook(() => useKeybindings());
    pressShift();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', shiftKey: true }));
    pressShift();
    expect(commandRegistry.run).not.toHaveBeenCalledWith('workbench.quickOpen');
  });

  it('does not trigger when the taps are too far apart', () => {
    vi.useFakeTimers();
    renderHook(() => useKeybindings());
    pressShift();
    vi.advanceTimersByTime(500);
    pressShift();
    expect(commandRegistry.run).not.toHaveBeenCalledWith('workbench.quickOpen');
    vi.useRealTimers();
  });
});
