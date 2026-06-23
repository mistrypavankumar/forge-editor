import { useEffect } from 'react';
import { commandRegistry } from '../commands/command-registry';
import { commandForKeyEvent, defaultKeybindings, mergeKeybindings } from './keybinding-service';

/** Max gap (ms) between the two Shift taps to count as a double-press. */
const DOUBLE_SHIFT_MS = 300;

export function useKeybindings(overrides: Record<string, string> = {}): void {
  useEffect(() => {
    const isMac = window.forge.isMac;
    const bindings = mergeKeybindings(defaultKeybindings, overrides);
    // Tracks the timestamp of a lone Shift tap so a second tap can fire "Go to File".
    let lastShift = 0;
    const onKeyDown = (e: KeyboardEvent): void => {
      // Double-press Shift → Go to File (IntelliJ-style), same as Cmd/Ctrl+P. Only a clean
      // Shift tap counts — held-down repeats or Shift combined with another modifier reset it.
      if (e.key === 'Shift') {
        if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          if (now - lastShift < DOUBLE_SHIFT_MS) {
            lastShift = 0;
            e.preventDefault();
            void commandRegistry.run('workbench.quickOpen');
          } else {
            lastShift = now;
          }
        } else {
          lastShift = 0;
        }
        return; // a Shift keydown never maps to a command on its own
      }
      // Any other key breaks a pending double-Shift sequence (e.g. Shift+letter for a capital).
      lastShift = 0;

      const id = commandForKeyEvent(e, isMac, bindings);
      if (!id) return;
      e.preventDefault();
      void commandRegistry.run(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overrides]);
}
