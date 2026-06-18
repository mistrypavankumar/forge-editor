import { useEffect } from 'react';
import { commandRegistry } from '../commands/command-registry';
import { commandForKeyEvent, defaultKeybindings, mergeKeybindings } from './keybinding-service';

export function useKeybindings(overrides: Record<string, string> = {}): void {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const bindings = mergeKeybindings(defaultKeybindings, overrides);
    const onKeyDown = (e: KeyboardEvent): void => {
      const id = commandForKeyEvent(e, isMac, bindings);
      if (!id) return;
      e.preventDefault();
      void commandRegistry.run(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overrides]);
}
