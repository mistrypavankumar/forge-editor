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
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export const defaultKeybindings: Record<string, string> = {
  'mod+s': 'file.save',
  'alt+shift+f': 'editor.formatDocument',
  'mod+n': 'file.newTextFile',
  'mod+w': 'file.closeEditor',
  'mod+o': 'file.openFolder',
  'mod+b': 'view.toggleSidebar',
  'mod+j': 'view.toggleBottomPanel',
  'mod+shift+p': 'workbench.commandPalette',
  'mod+k': 'workbench.commandPalette',
  'mod+p': 'workbench.quickOpen',
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
