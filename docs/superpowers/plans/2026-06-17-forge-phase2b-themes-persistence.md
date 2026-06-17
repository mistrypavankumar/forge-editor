# Forge Phase 2b — Themes & Settings Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Forge customizable and sticky — switchable color themes (dark/light) applied as CSS variables + matching Monaco theme, and on-disk persistence of theme, sidebar visibility, and keybinding overrides so the app reopens the way you left it.

**Architecture:** Themes are plain data (`Theme` objects mapping CSS-variable names → values). A pure `theme-service.applyCssVariables` writes them to `:root` (testable in jsdom, no Monaco import). A `theme-store` holds the current theme id; `AppShell` applies CSS vars on change, while `EditorPane` (which owns Monaco) switches the editor theme. A main-process `settings-service` reads/writes `~/.forge/settings.json` over `Result`-based IPC; the renderer hydrates stores on startup and persists on change.

**Tech Stack:** No new dependencies.

## Global Constraints

- TS strict, no `any`; IPC returns `Result<T>`; Electron security unchanged.
- `theme-service` must NOT import Monaco (keeps it unit-testable); Monaco theme switching lives in `EditorPane`.
- Settings file: `~/.forge/settings.json`; missing file → empty settings, never an error.

---

### Task 1: Theme model, registry, service, and store

**Files:**
- Create: `src/renderer/src/theme/themes.ts` (Theme type + built-in dark/light)
- Create: `src/renderer/src/theme/theme-service.ts` (applyCssVariables)
- Test: `src/renderer/src/theme/theme-service.test.ts`
- Create: `src/renderer/src/stores/theme-store.ts`
- Test: `src/renderer/src/stores/theme-store.test.ts`

**Interfaces:**
- Produces:
  - `interface Theme { id: string; name: string; type: 'dark' | 'light'; colors: Record<string, string> }`
  - `builtInThemes: Record<string, Theme>` with ids `forge-dark`, `forge-light`
  - `applyCssVariables(theme: Theme, root?: HTMLElement): void`
  - `interface ThemeState { currentId: string; setTheme: (id: string) => void; }`, `useThemeStore`

- [ ] **Step 1: Write the failing test for `theme-service`**

```ts
import { describe, expect, it } from 'vitest';
import { applyCssVariables } from './theme-service';

describe('theme-service', () => {
  it('writes color tokens as CSS variables on the root', () => {
    const root = document.createElement('div');
    applyCssVariables(
      { id: 't', name: 'T', type: 'dark', colors: { bg: '#000', fg: '#fff' } },
      root,
    );
    expect(root.style.getPropertyValue('--bg')).toBe('#000');
    expect(root.style.getPropertyValue('--fg')).toBe('#fff');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- theme-service`).

- [ ] **Step 3: Create `src/renderer/src/theme/themes.ts`**

```ts
export interface Theme {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: Record<string, string>;
}

const DARK: Theme = {
  id: 'forge-dark',
  name: 'Forge Dark',
  type: 'dark',
  colors: {
    bg: '#1b1b1f',
    'bg-elevated': '#202024',
    'bg-titlebar': '#18181b',
    'bg-activitybar': '#161619',
    'bg-statusbar': '#18181b',
    'surface-hover': '#26262c',
    'surface-active': '#2e2e36',
    border: '#2a2a31',
    'border-subtle': '#232328',
    fg: '#e4e4e7',
    'fg-muted': '#a1a1aa',
    'fg-faint': '#71717a',
    accent: '#7c6cf6',
    'accent-hover': '#8f80f8',
    'accent-soft': '#7c6cf61f',
    dirty: '#e2b340',
  },
};

const LIGHT: Theme = {
  id: 'forge-light',
  name: 'Forge Light',
  type: 'light',
  colors: {
    bg: '#ffffff',
    'bg-elevated': '#f6f6f8',
    'bg-titlebar': '#ececed',
    'bg-activitybar': '#e8e8eb',
    'bg-statusbar': '#ececed',
    'surface-hover': '#ececef',
    'surface-active': '#e0e0e4',
    border: '#d4d4d8',
    'border-subtle': '#e4e4e7',
    fg: '#1f1f23',
    'fg-muted': '#52525b',
    'fg-faint': '#9b9ba3',
    accent: '#6950e8',
    'accent-hover': '#5a40d8',
    'accent-soft': '#6950e81f',
    dirty: '#c2820a',
  },
};

export const builtInThemes: Record<string, Theme> = {
  [DARK.id]: DARK,
  [LIGHT.id]: LIGHT,
};
```

- [ ] **Step 4: Create `src/renderer/src/theme/theme-service.ts`**

```ts
import type { Theme } from './themes';

export function applyCssVariables(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}
```

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- theme-service`).

- [ ] **Step 6: Write the failing test for `theme-store`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from './theme-store';

describe('theme-store', () => {
  beforeEach(() => useThemeStore.setState({ currentId: 'forge-dark' }));

  it('defaults to forge-dark', () => {
    expect(useThemeStore.getState().currentId).toBe('forge-dark');
  });

  it('setTheme changes the current id', () => {
    useThemeStore.getState().setTheme('forge-light');
    expect(useThemeStore.getState().currentId).toBe('forge-light');
  });
});
```

- [ ] **Step 7: Run it — expect FAIL** (`npm run test -- theme-store`).

- [ ] **Step 8: Create `src/renderer/src/stores/theme-store.ts`**

```ts
import { create } from 'zustand';

export interface ThemeState {
  currentId: string;
  setTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentId: 'forge-dark',
  setTheme: (id) => set({ currentId: id }),
}));
```

- [ ] **Step 9: Run it — expect PASS** (`npm run test -- theme-store`).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/theme/ src/renderer/src/stores/theme-store.*
git commit -m "feat: add theme model, service, and store"
```

---

### Task 2: Apply themes (CSS vars + Monaco), theme commands

**Files:**
- Modify: `src/renderer/src/editor/monaco-setup.ts` (add `forge-light` theme)
- Modify: `src/renderer/src/components/EditorPane.tsx` (switch Monaco theme on theme change)
- Modify: `src/renderer/src/components/AppShell.tsx` (apply CSS vars on theme change)
- Create: `src/renderer/src/commands/theme-commands.ts`
- Modify: `src/renderer/src/main.tsx` (register theme commands)

**Interfaces:**
- Consumes: `useThemeStore`, `builtInThemes`, `applyCssVariables`, `commandRegistry`.
- Produces: `registerThemeCommands(): void` — registers `theme.dark`, `theme.light`, `theme.toggle`.

- [ ] **Step 1: Add `forge-light` to `src/renderer/src/editor/monaco-setup.ts`** — inside `getMonaco()`, after the `forge-dark` `defineTheme` call and before `themeDefined = true;`, add:

```ts
    monaco.editor.defineTheme('forge-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1f1f23',
        'editorLineNumber.foreground': '#9b9ba3',
        'editorLineNumber.activeForeground': '#52525b',
        'editor.lineHighlightBackground': '#f4f4f6',
        'editor.selectionBackground': '#6950e833',
        'editorCursor.foreground': '#6950e8',
        'editorWidget.background': '#f6f6f8',
        'editorWidget.border': '#d4d4d8',
      },
    });
```

- [ ] **Step 2: Switch Monaco theme on change in `src/renderer/src/components/EditorPane.tsx`** — add the import and an effect.

Add import:

```tsx
import { useThemeStore } from '../stores/theme-store';
import { builtInThemes } from '../theme/themes';
```

Inside the component, add a selector near the other store hooks:

```tsx
  const themeId = useThemeStore((s) => s.currentId);
```

Add an effect (after the existing effects):

```tsx
  useEffect(() => {
    const theme = builtInThemes[themeId];
    const monacoTheme = theme?.type === 'light' ? 'forge-light' : 'forge-dark';
    getMonaco().editor.setTheme(monacoTheme);
  }, [themeId]);
```

- [ ] **Step 3: Apply CSS variables on theme change in `src/renderer/src/components/AppShell.tsx`** — add imports:

```tsx
import { useEffect } from 'react';
import { applyCssVariables } from '../theme/theme-service';
import { builtInThemes } from '../theme/themes';
import { useThemeStore } from '../stores/theme-store';
```

(If `useEffect` is not already imported, add it.) Inside `AppShell()`, add:

```tsx
  const themeId = useThemeStore((s) => s.currentId);
  useEffect(() => {
    const theme = builtInThemes[themeId];
    if (theme) applyCssVariables(theme);
  }, [themeId]);
```

- [ ] **Step 4: Create `src/renderer/src/commands/theme-commands.ts`**

```ts
import { commandRegistry } from './command-registry';
import { useThemeStore } from '../stores/theme-store';

export function registerThemeCommands(): void {
  commandRegistry.register({
    id: 'theme.dark',
    title: 'Color Theme: Forge Dark',
    category: 'Preferences',
    run: () => useThemeStore.getState().setTheme('forge-dark'),
  });
  commandRegistry.register({
    id: 'theme.light',
    title: 'Color Theme: Forge Light',
    category: 'Preferences',
    run: () => useThemeStore.getState().setTheme('forge-light'),
  });
  commandRegistry.register({
    id: 'theme.toggle',
    title: 'Toggle Light/Dark Theme',
    category: 'Preferences',
    run: () => {
      const { currentId, setTheme } = useThemeStore.getState();
      setTheme(currentId === 'forge-dark' ? 'forge-light' : 'forge-dark');
    },
  });
}
```

- [ ] **Step 5: Register at startup in `src/renderer/src/main.tsx`** — add import and call (after `registerPaletteCommands();`):

```tsx
import { registerThemeCommands } from './commands/theme-commands';

registerThemeCommands();
```

- [ ] **Step 6: Full gate** (`npm run test && npm run type-check && npm run build`) — expect all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: apply themes to UI and Monaco with theme commands"
```

---

### Task 3: Settings persistence (~/.forge/settings.json)

**Files:**
- Modify: `src/shared/ipc-contract.ts` (add `loadSettings`/`saveSettings` + `ForgeSettings`)
- Create: `src/main/settings/settings-service.ts`
- Test: `src/main/settings/settings-service.test.ts`
- Modify: `src/main/index.ts` (register handlers using `~/.forge/settings.json`)
- Modify: `src/preload/api.ts` (expose loadSettings/saveSettings)
- Create: `src/renderer/src/settings/use-settings-persistence.ts`
- Modify: `src/renderer/src/components/AppShell.tsx` (hydrate + persist)

**Interfaces:**
- Produces:
  - `interface ForgeSettings { themeId?: string; sidebarVisible?: boolean; keybindings?: Record<string, string> }`
  - `ForgeApi.loadSettings(): Promise<Result<ForgeSettings>>`, `ForgeApi.saveSettings(settings: ForgeSettings): Promise<Result<void>>`
  - `readSettings(filePath: string): Promise<ForgeSettings>`, `writeSettings(filePath: string, settings: ForgeSettings): Promise<void>`
  - `useSettingsPersistence(): void`

- [ ] **Step 1: Write the failing test for `settings-service`**

```ts
// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, writeSettings } from './settings-service';

describe('settings-service', () => {
  it('returns empty settings when the file is missing', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'forge-')), 'settings.json');
    expect(await readSettings(file)).toEqual({});
  });

  it('writes then reads settings, creating the directory', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'forge-')), 'nested', 'settings.json');
    await writeSettings(file, { themeId: 'forge-light', sidebarVisible: false });
    expect(await readSettings(file)).toEqual({ themeId: 'forge-light', sidebarVisible: false });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- settings-service`).

- [ ] **Step 3: Add types to `src/shared/ipc-contract.ts`** — add channels inside `IpcChannels`:

```ts
  loadSettings: 'forge:settings:load',
  saveSettings: 'forge:settings:save',
```

add the type:

```ts
export interface ForgeSettings {
  themeId?: string;
  sidebarVisible?: boolean;
  keybindings?: Record<string, string>;
}
```

and to `ForgeApi`:

```ts
  loadSettings: () => Promise<Result<ForgeSettings>>;
  saveSettings: (settings: ForgeSettings) => Promise<Result<void>>;
```

- [ ] **Step 4: Create `src/main/settings/settings-service.ts`**

```ts
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { ForgeSettings } from '@shared/ipc-contract';

export async function readSettings(filePath: string): Promise<ForgeSettings> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ForgeSettings;
  } catch {
    return {};
  }
}

export async function writeSettings(filePath: string, settings: ForgeSettings): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
}
```

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- settings-service`).

- [ ] **Step 6: Register handlers in `src/main/index.ts`** — add imports:

```ts
import { homedir } from 'node:os';
import { readSettings, writeSettings } from './settings/settings-service';
```

(merge the `node:os` import; `join` is already imported.) Add a path constant near the top after imports:

```ts
const SETTINGS_PATH = join(homedir(), '.forge', 'settings.json');
```

Add handlers beside the others:

```ts
  ipcMain.handle(IpcChannels.loadSettings, () => toResult(() => readSettings(SETTINGS_PATH)));
  ipcMain.handle(IpcChannels.saveSettings, (_e, settings: import('@shared/ipc-contract').ForgeSettings) =>
    toResult(() => writeSettings(SETTINGS_PATH, settings)),
  );
```

- [ ] **Step 7: Expose in `src/preload/api.ts`** — add:

```ts
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
```

- [ ] **Step 8: Create `src/renderer/src/settings/use-settings-persistence.ts`**

```ts
import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/theme-store';
import { useLayoutStore } from '../stores/layout-store';

export function useSettingsPersistence(): void {
  const hydrated = useRef(false);
  const themeId = useThemeStore((s) => s.currentId);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);

  // Hydrate once on mount.
  useEffect(() => {
    void window.forge.loadSettings().then((res) => {
      if (res.ok) {
        if (res.data.themeId) useThemeStore.getState().setTheme(res.data.themeId);
        if (typeof res.data.sidebarVisible === 'boolean') {
          useLayoutStore.getState().setPanelVisible('sidebar', res.data.sidebarVisible);
        }
      }
      hydrated.current = true;
    });
  }, []);

  // Persist on change (after hydration, to avoid clobbering stored values on first render).
  useEffect(() => {
    if (!hydrated.current) return;
    void window.forge.saveSettings({ themeId, sidebarVisible });
  }, [themeId, sidebarVisible]);
}
```

- [ ] **Step 9: Mount in `src/renderer/src/components/AppShell.tsx`** — add import and call it alongside the other hooks:

```tsx
import { useSettingsPersistence } from '../settings/use-settings-persistence';
```

inside `AppShell()`:

```tsx
  useSettingsPersistence();
```

- [ ] **Step 10: Guard the AppShell test** — `useSettingsPersistence` calls `window.forge.loadSettings`. Add a stub to `src/renderer/src/components/AppShell.test.tsx`'s `beforeAll` body (alongside the existing `forge.ping` stub), replacing the assignment to include the new methods:

```tsx
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    ping: async (m: string) => `pong: ${m}`,
    loadSettings: async () => ({ ok: true, data: {} }),
    saveSettings: async () => ({ ok: true, data: undefined }),
  };
```

- [ ] **Step 11: Full gate** (`npm run test && npm run type-check && npm run build`) — expect all green.

- [ ] **Step 12: Manual verify**

Run: `pnpm dev`
Expected: ⌘⇧P → "Toggle Light/Dark Theme" flips the whole UI and the editor between dark and light; quit and relaunch → the chosen theme and sidebar state are restored. `~/.forge/settings.json` exists with `themeId`/`sidebarVisible`.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: persist theme and layout to ~/.forge/settings.json"
```

---

## Self-Review

**Spec coverage (Phase 2 — customization portion):** themes applied as CSS vars + Monaco theme (Tasks 1–2) ✓; built-in dark/light (Task 1) ✓; theme switch commands (Task 2) ✓; layout persistence (Task 3) ✓; keybinding-override persistence groundwork — settings carry `keybindings`, and `useKeybindings(overrides)` already accepts them (full wiring is trivial follow-up). Plugin system remains Phase 5.

**Placeholder scan:** None — all steps show complete code.

**Type consistency:** `Theme`/`builtInThemes` consistent across themes, service, EditorPane, AppShell, commands. `ForgeSettings` defined once and used in settings-service, preload, persistence hook. Theme ids (`forge-dark`, `forge-light`) match between `themes.ts`, `monaco-setup.ts`, theme-store default, and theme-commands.
