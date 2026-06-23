/**
 * Editor syntax color schemes — pure data + resolution, with NO `monaco-editor` import, so the
 * settings UI and other non-editor code can reference the scheme list without pulling Monaco (and
 * its web-worker imports) into their bundle/test environment. The Monaco theme definitions that
 * these ids map to live in monaco-setup.ts.
 */

export interface EditorScheme {
  id: string;
  name: string;
}

/** `auto` follows the interface light/dark theme; the rest force a specific Monaco theme. */
export const EDITOR_SCHEMES: EditorScheme[] = [
  { id: 'auto', name: 'Match interface' },
  { id: 'dark-plus', name: 'VS Code Dark+' },
  { id: 'light-plus', name: 'VS Code Light+' },
  { id: 'minimal-dark', name: 'Forge Minimal (Dark)' },
  { id: 'github-dark', name: 'GitHub Dark' },
  { id: 'monokai', name: 'Monokai' },
];

/** Each forced scheme's Monaco theme name and whether it's a light or dark palette. */
const SCHEME_THEMES: Record<string, { theme: string; type: 'dark' | 'light' }> = {
  'dark-plus': { theme: 'forge-dark', type: 'dark' },
  'light-plus': { theme: 'forge-light', type: 'light' },
  'minimal-dark': { theme: 'forge-minimal-dark', type: 'dark' },
  'github-dark': { theme: 'github-dark', type: 'dark' },
  monokai: { theme: 'monokai', type: 'dark' },
};

/**
 * Resolve a scheme id (+ the current interface light/dark type) to a defined Monaco theme name.
 * `auto` follows the interface. A specific scheme whose palette type mismatches the interface
 * (e.g. a dark scheme while the UI is light) is auto-swapped to the interface-matched default,
 * so dark syntax colors never end up unreadable on a light background (or vice versa).
 */
export function monacoThemeForScheme(scheme: string, uiType: 'dark' | 'light'): string {
  const interfaceDefault = uiType === 'light' ? 'forge-light' : 'forge-dark';
  const picked = SCHEME_THEMES[scheme];
  if (!picked || picked.type !== uiType) return interfaceDefault;
  return picked.theme;
}
