export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function eventToKeystroke(e: KeyEventLike, isMac: boolean): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('mod');
  // On mac, the Control key is distinct from the "mod" (Command) key.
  if (isMac && e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export const defaultKeybindings: Record<string, string> = {
  'mod+s': 'file.save',
  'mod+alt+s': 'file.saveAll',
  'mod+n': 'file.newTextFile',
  'mod+shift+n': 'file.newWindow',
  'mod+w': 'file.closeEditor',
  'mod+shift+t': 'file.reopenClosedEditor',
  'mod+o': 'file.openFolder',
  'mod+b': 'view.toggleSidebar',
  'mod+j': 'view.toggleBottomPanel',
  'ctrl+`': 'view.toggleTerminal',
  'mod+`': 'view.toggleTerminal',
  'mod+g': 'editor.gotoLine',
  'mod+shift+l': 'editor.toggleInlineRun',
  'mod+shift+f': 'workbench.findInFiles',
  'mod+alt+arrowright': 'editor.nextTab',
  'mod+alt+arrowleft': 'editor.prevTab',
  'mod+\\': 'editor.splitRight',
  'mod+shift+p': 'workbench.commandPalette',
  'mod+k': 'workbench.commandPalette',
  'mod+p': 'workbench.quickOpen',
  'mod+,': 'workbench.openSettings',
};

export function mergeKeybindings(
  defaults: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...overrides };
}

export function resolveCommandId(
  keystroke: string,
  bindings: Record<string, string>,
): string | undefined {
  return bindings[keystroke];
}

/**
 * Resolve the command bound to a keyboard event, or undefined if none.
 * Shared by the window listener and the Monaco editor so shortcuts behave
 * identically whether or not the editor has focus.
 */
export function commandForKeyEvent(
  e: KeyEventLike,
  isMac: boolean,
  bindings: Record<string, string>,
): string | undefined {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return undefined;
  return resolveCommandId(eventToKeystroke(e, isMac), bindings);
}
