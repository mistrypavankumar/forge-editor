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

/** Resolve a scheme id (+ the current interface light/dark type) to a defined Monaco theme name. */
export function monacoThemeForScheme(scheme: string, uiType: 'dark' | 'light'): string {
  switch (scheme) {
    case 'dark-plus':
      return 'forge-dark';
    case 'light-plus':
      return 'forge-light';
    case 'minimal-dark':
      return 'forge-minimal-dark';
    case 'github-dark':
      return 'github-dark';
    case 'monokai':
      return 'monokai';
    default:
      return uiType === 'light' ? 'forge-light' : 'forge-dark';
  }
}
