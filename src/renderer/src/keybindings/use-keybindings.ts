import { useEffect } from 'react';
import { commandRegistry } from '../commands/command-registry';
import {
  defaultKeybindings,
  eventToKeystroke,
  mergeKeybindings,
  resolveCommandId,
} from './keybinding-service';

export function useKeybindings(overrides: Record<string, string> = {}): void {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const bindings = mergeKeybindings(defaultKeybindings, overrides);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
      const keystroke = eventToKeystroke(e, isMac);
      const id = resolveCommandId(keystroke, bindings);
      if (!id) return;
      e.preventDefault();
      void commandRegistry.run(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overrides]);
}
