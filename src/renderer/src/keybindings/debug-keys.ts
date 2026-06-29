/**
 * Map a keyboard event to a debugger command. These are the conventional VS Code function-key
 * bindings (F5/F9/F10/F11). They're handled separately from the main keybinding service because
 * that service only fires for chords carrying a modifier (Cmd/Ctrl/Alt) — these are bare F-keys.
 *
 * Each binding claims the key only with its exact modifier set, so it never shadows existing
 * combos like Alt+F5 (go to next change).
 */
export function debugCommandForKey(e: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}): string | undefined {
  const plain = !e.altKey && !e.metaKey && !e.ctrlKey;
  switch (e.key) {
    case 'F5':
      if (!plain) return undefined;
      return e.shiftKey ? 'debug.stop' : 'debug.startOrContinue';
    case 'F9':
      return plain && !e.shiftKey ? 'debug.toggleBreakpoint' : undefined;
    case 'F10':
      return plain && !e.shiftKey ? 'debug.stepOver' : undefined;
    case 'F11':
      if (!plain) return undefined;
      return e.shiftKey ? 'debug.stepOut' : 'debug.stepInto';
    default:
      return undefined;
  }
}
