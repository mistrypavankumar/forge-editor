# Forge Phase 2a — Command & Keybinding Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the command-registry spine the whole app routes through — every action is a registered command, the command palette and keybindings dispatch commands, and a fuzzy quick-open jumps to any file. This is the seam plugins plug into later.

**Architecture:** A renderer-side `commandRegistry` (plain module, Map-backed) holds `Command` objects. Core commands close over the existing Zustand stores + `window.forge`. A `keybinding-service` maps normalized keystrokes → command ids (defaults + user overrides) and a global listener dispatches them — replacing EditorPane's ad-hoc Cmd+S. A `Palette` overlay drives both Command Palette (⌘⇧P) and Quick Open (⌘P) via a shared fuzzy matcher, with quick-open backed by a new recursive `listFiles` IPC.

**Tech Stack:** No new dependencies. Reuses Zustand, lucide-react, the typed IPC contract, Vitest.

## Global Constraints

- TS strict, no `any`; Electron security unchanged; IPC returns `Result<T>`.
- `mod` = ⌘ on macOS, Ctrl elsewhere — resolved once from platform, injectable in tests.
- Commands are the single source of action: UI/keybindings/palette all call `commandRegistry.run(id)`.
- Named exports; max 2 function params.

---

### Task 1: Command registry + core commands

**Files:**
- Create: `src/renderer/src/commands/command-registry.ts`
- Test: `src/renderer/src/commands/command-registry.test.ts`
- Create: `src/renderer/src/commands/core-commands.ts`
- Modify: `src/renderer/src/main.tsx` (register at startup)
- Modify: `src/renderer/src/components/EditorPane.tsx` (remove ad-hoc Cmd+S — moved to a command)

**Interfaces:**
- Produces:
  - `interface Command { id: string; title: string; category?: string; run: () => void | Promise<void>; isEnabled?: () => boolean; }`
  - `commandRegistry: { register(cmd: Command): void; get(id: string): Command | undefined; all(): Command[]; run(id: string): Promise<void>; }`
  - `registerCoreCommands(): void` — registers `file.save`, `file.openFolder`, `view.toggleSidebar`
  - `saveActiveFile(): Promise<void>` (exported for reuse/testing)

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commandRegistry } from './command-registry';

beforeEach(() => {
  for (const c of commandRegistry.all()) commandRegistry.register({ ...c }); // keep ids
  // hard reset:
  (commandRegistry as unknown as { commands: Map<string, unknown> }).commands.clear();
});

describe('command-registry', () => {
  it('registers and retrieves a command', () => {
    commandRegistry.register({ id: 'a', title: 'A', run: () => {} });
    expect(commandRegistry.get('a')?.title).toBe('A');
  });

  it('all() lists registered commands', () => {
    commandRegistry.register({ id: 'a', title: 'A', run: () => {} });
    commandRegistry.register({ id: 'b', title: 'B', run: () => {} });
    expect(commandRegistry.all().map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('run invokes the command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'a', title: 'A', run });
    await commandRegistry.run('a');
    expect(run).toHaveBeenCalledOnce();
  });

  it('run skips a disabled command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'a', title: 'A', run, isEnabled: () => false });
    await commandRegistry.run('a');
    expect(run).not.toHaveBeenCalled();
  });

  it('run on an unknown id is a no-op', async () => {
    await expect(commandRegistry.run('missing')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- command-registry`).

- [ ] **Step 3: Create `src/renderer/src/commands/command-registry.ts`**

```ts
export interface Command {
  id: string;
  title: string;
  category?: string;
  run: () => void | Promise<void>;
  isEnabled?: () => boolean;
}

class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.id, cmd);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()];
  }

  async run(id: string): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) return;
    if (cmd.isEnabled && !cmd.isEnabled()) return;
    await cmd.run();
  }
}

export const commandRegistry = new CommandRegistry();
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- command-registry`).

- [ ] **Step 5: Create `src/renderer/src/commands/core-commands.ts`**

```ts
import { commandRegistry } from './command-registry';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';

export async function saveActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab) return;
  const res = await window.forge.writeFile(tab.path, tab.content);
  if (res.ok) state.markSaved(tab.path);
}

async function openFolder(): Promise<void> {
  const res = await window.forge.openFolder();
  if (res.ok && res.data) useWorkspaceStore.getState().setWorkspace(res.data.rootPath, res.data.tree);
}

export function registerCoreCommands(): void {
  commandRegistry.register({
    id: 'file.save',
    title: 'Save File',
    category: 'File',
    run: saveActiveFile,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'file.openFolder',
    title: 'Open Folder…',
    category: 'File',
    run: openFolder,
  });
  commandRegistry.register({
    id: 'view.toggleSidebar',
    title: 'Toggle Sidebar',
    category: 'View',
    run: () => useLayoutStore.getState().togglePanel('sidebar'),
  });
}
```

- [ ] **Step 6: Register at startup in `src/renderer/src/main.tsx`** — add after the imports and before `createRoot`:

```tsx
import { registerCoreCommands } from './commands/core-commands';

registerCoreCommands();
```

- [ ] **Step 7: Remove the ad-hoc Cmd+S effect from `src/renderer/src/components/EditorPane.tsx`** (it becomes the `file.save` command, dispatched by the keybinding service in Task 3). Delete this whole block:

```tsx
  // Cmd/Ctrl+S saves the active tab. (Migrates to the keybinding-service in Phase 2.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const tab = state.tabs.find((t) => t.path === state.activePath);
        if (!tab) return;
        void window.forge.writeFile(tab.path, tab.content).then((res) => {
          if (res.ok) markSaved(tab.path);
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [markSaved]);
```

Then remove `markSaved` from the store selectors at the top of the component (it is no longer used there): delete the line `const markSaved = useEditorStore((s) => s.markSaved);`.

- [ ] **Step 8: Type-check** (`npm run type-check`) — expect exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add command registry and core commands"
```

---

### Task 2: Fuzzy matcher

**Files:**
- Create: `src/renderer/src/util/fuzzy.ts`
- Test: `src/renderer/src/util/fuzzy.test.ts`

**Interfaces:**
- Produces: `fuzzyMatch(query: string, target: string): { matched: boolean; score: number }` — case-insensitive subsequence match; higher score = better; consecutive and start-of-string matches score higher; empty query matches everything with score 0.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyMatch('ape', 'AppEditor').matched).toBe(true);
  });

  it('does not match when characters are absent or out of order', () => {
    expect(fuzzyMatch('zzz', 'AppEditor').matched).toBe(false);
    expect(fuzzyMatch('ea', 'AppEditor').matched).toBe(false);
  });

  it('empty query matches with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ matched: true, score: 0 });
  });

  it('ranks contiguous and earlier matches higher', () => {
    const contiguous = fuzzyMatch('app', 'app-store').score;
    const scattered = fuzzyMatch('app', 'a-p-p-store').score;
    expect(contiguous).toBeGreaterThan(scattered);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- fuzzy`).

- [ ] **Step 3: Create `src/renderer/src/util/fuzzy.ts`**

```ts
export function fuzzyMatch(query: string, target: string): { matched: boolean; score: number } {
  if (query.length === 0) return { matched: true, score: 0 };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatchIndex = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (ti === prevMatchIndex + 1) score += 5; // contiguous bonus
      if (ti === 0) score += 8; // start bonus
      else if (t[ti - 1] === '-' || t[ti - 1] === '/' || t[ti - 1] === '.') score += 4; // boundary
      prevMatchIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return { matched: false, score: 0 };
  return { matched: true, score: score - t.length * 0.01 }; // mild shorter-target preference
}
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- fuzzy`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/util/fuzzy.ts src/renderer/src/util/fuzzy.test.ts
git commit -m "feat: add fuzzy matcher for palette filtering"
```

---

### Task 3: Keybinding service + global dispatch

**Files:**
- Create: `src/renderer/src/keybindings/keybinding-service.ts`
- Test: `src/renderer/src/keybindings/keybinding-service.test.ts`
- Create: `src/renderer/src/keybindings/use-keybindings.ts`
- Modify: `src/renderer/src/components/AppShell.tsx` (mount the hook)

**Interfaces:**
- Consumes: `commandRegistry` (Task 1).
- Produces:
  - `interface KeyEventLike { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; }`
  - `eventToKeystroke(e: KeyEventLike, isMac: boolean): string` — e.g. `'mod+shift+p'`
  - `defaultKeybindings: Record<string, string>` (keystroke → command id)
  - `mergeKeybindings(defaults: Record<string,string>, overrides: Record<string,string>): Record<string,string>`
  - `resolveCommandId(keystroke: string, bindings: Record<string,string>): string | undefined`
  - `useKeybindings(): void` — React hook installing a global keydown listener (consumed by Task 4/5 commands too)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  defaultKeybindings,
  eventToKeystroke,
  mergeKeybindings,
  resolveCommandId,
} from './keybinding-service';

const ev = (over: Partial<Parameters<typeof eventToKeystroke>[0]>) => ({
  key: 's',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('keybinding-service', () => {
  it('maps meta to mod on mac', () => {
    expect(eventToKeystroke(ev({ key: 's', metaKey: true }), true)).toBe('mod+s');
  });

  it('maps ctrl to mod off mac', () => {
    expect(eventToKeystroke(ev({ key: 's', ctrlKey: true }), false)).toBe('mod+s');
  });

  it('includes shift and lowercases the key', () => {
    expect(eventToKeystroke(ev({ key: 'P', metaKey: true, shiftKey: true }), true)).toBe(
      'mod+shift+p',
    );
  });

  it('default bindings include save and command palette', () => {
    expect(defaultKeybindings['mod+s']).toBe('file.save');
    expect(defaultKeybindings['mod+shift+p']).toBe('workbench.commandPalette');
  });

  it('overrides win over defaults', () => {
    const merged = mergeKeybindings({ 'mod+s': 'file.save' }, { 'mod+s': 'file.other' });
    expect(merged['mod+s']).toBe('file.other');
  });

  it('resolveCommandId looks up a binding', () => {
    expect(resolveCommandId('mod+s', { 'mod+s': 'file.save' })).toBe('file.save');
    expect(resolveCommandId('mod+x', { 'mod+s': 'file.save' })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- keybinding-service`).

- [ ] **Step 3: Create `src/renderer/src/keybindings/keybinding-service.ts`**

```ts
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
  'mod+b': 'view.toggleSidebar',
  'mod+shift+p': 'workbench.commandPalette',
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
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- keybinding-service`).

- [ ] **Step 5: Create `src/renderer/src/keybindings/use-keybindings.ts`**

```ts
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
```

- [ ] **Step 6: Mount the hook in `src/renderer/src/components/AppShell.tsx`** — add the import and call it at the top of the component body:

```tsx
import { useKeybindings } from '../keybindings/use-keybindings';
```

Inside `AppShell()` before the return, add:

```tsx
  useKeybindings();
```

- [ ] **Step 7: Type-check + test** (`npm run type-check && npm run test`) — expect exit 0 and all green. (Cmd+S now flows through `file.save`.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add keybinding service routing keystrokes to commands"
```

---

### Task 4: Recursive file listing for quick-open

**Files:**
- Modify: `src/shared/ipc-contract.ts` (add `listFiles` channel + `FileItem` + `ForgeApi.listFiles`)
- Modify: `src/main/fs/fs-service.ts` (add `listFilesRecursive`)
- Test: `src/main/fs/fs-service.test.ts` (add cases)
- Modify: `src/main/index.ts` (register handler)
- Modify: `src/preload/api.ts` (expose `listFiles`)

**Interfaces:**
- Produces:
  - `interface FileItem { name: string; path: string; relPath: string }`
  - `ForgeApi.listFiles(rootPath: string): Promise<Result<FileItem[]>>`
  - `listFilesRecursive(rootPath: string): Promise<FileItem[]>` (skips `node_modules`, `.git`, `dist`, `out`)

- [ ] **Step 1: Add the failing test cases to `src/main/fs/fs-service.test.ts`** — add inside the existing `describe`:

```ts
  it('listFilesRecursive walks nested files and skips ignored dirs', async () => {
    const { mkdtempSync: mk, mkdirSync: md, writeFileSync: wf } = await import('node:fs');
    const dir = mk(join(tmpdir(), 'forge-'));
    md(join(dir, 'src'));
    md(join(dir, 'node_modules'));
    wf(join(dir, 'src', 'a.ts'), 'x');
    wf(join(dir, 'readme.md'), 'y');
    wf(join(dir, 'node_modules', 'ignored.js'), 'z');
    const { listFilesRecursive } = await import('./fs-service');
    const files = await listFilesRecursive(dir);
    const rels = files.map((f) => f.relPath).sort();
    expect(rels).toEqual(['readme.md', 'src/a.ts']);
  });
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- fs-service`) — `listFilesRecursive` undefined.

- [ ] **Step 3: Add `listFilesRecursive` to `src/main/fs/fs-service.ts`**

Add the import and function:

```ts
import { join, relative } from 'node:path';
```

(replace the existing `import { join } from 'node:path';`), then append:

```ts
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

export async function listFilesRecursive(rootPath: string): Promise<DirEntry[] extends never ? never : import('@shared/ipc-contract').FileItem[]> {
  const results: import('@shared/ipc-contract').FileItem[] = [];
  async function walk(dir: string): Promise<void> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (IGNORED_DIRS.has(d.name)) continue;
        await walk(full);
      } else {
        results.push({ name: d.name, path: full, relPath: relative(rootPath, full) });
      }
    }
  }
  await walk(rootPath);
  return results;
}
```

> Note: the awkward return type above is only to avoid an extra top-level import line in the diff. Prefer the clean version — add `import type { DirEntry, FileItem } from '@shared/ipc-contract';` at the top (replacing the existing DirEntry type import) and write the signature as `export async function listFilesRecursive(rootPath: string): Promise<FileItem[]>` with `const results: FileItem[] = [];`. Use the clean version.

- [ ] **Step 4: Use the clean version** — set the top import of `fs-service.ts` to:

```ts
import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import type { DirEntry, FileItem } from '@shared/ipc-contract';
```

and the function to:

```ts
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

export async function listFilesRecursive(rootPath: string): Promise<FileItem[]> {
  const results: FileItem[] = [];
  async function walk(dir: string): Promise<void> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (IGNORED_DIRS.has(d.name)) continue;
        await walk(full);
      } else {
        results.push({ name: d.name, path: full, relPath: relative(rootPath, full) });
      }
    }
  }
  await walk(rootPath);
  return results;
}
```

- [ ] **Step 5: Add to the contract `src/shared/ipc-contract.ts`** — add the channel inside `IpcChannels`:

```ts
  listFiles: 'forge:fs:listFiles',
```

add the type:

```ts
export interface FileItem {
  name: string;
  path: string;
  relPath: string;
}
```

and add to `ForgeApi`:

```ts
  listFiles: (rootPath: string) => Promise<Result<FileItem[]>>;
```

- [ ] **Step 6: Register the handler in `src/main/index.ts`** — add the import `listFilesRecursive` to the fs-service import, and add a handler beside the others:

```ts
  ipcMain.handle(IpcChannels.listFiles, (_e, rootPath: string) =>
    toResult(() => listFilesRecursive(rootPath)),
  );
```

- [ ] **Step 7: Expose in `src/preload/api.ts`** — add:

```ts
  listFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.listFiles, rootPath),
```

- [ ] **Step 8: Run it — expect PASS + type-check** (`npm run test -- fs-service && npm run type-check`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add recursive file listing IPC for quick-open"
```

---

### Task 5: Command palette + quick-open UI

**Files:**
- Create: `src/renderer/src/stores/palette-store.ts`
- Create: `src/renderer/src/commands/palette-commands.ts`
- Create: `src/renderer/src/components/Palette.tsx`
- Test: `src/renderer/src/components/Palette.test.tsx`
- Modify: `src/renderer/src/main.tsx` (register palette commands)
- Modify: `src/renderer/src/components/AppShell.tsx` (mount `<Palette />`)
- Modify: `src/renderer/src/styles/global.css` (palette styles)

**Interfaces:**
- Consumes: `commandRegistry`, `fuzzyMatch`, `useEditorStore`, `useWorkspaceStore`, `window.forge.listFiles/readFile`.
- Produces:
  - `type PaletteMode = 'commands' | 'files'`
  - `interface PaletteState { open: boolean; mode: PaletteMode; openPalette: (mode: PaletteMode) => void; close: () => void; }`
  - `usePaletteStore`
  - `registerPaletteCommands(): void` — registers `workbench.commandPalette`, `workbench.quickOpen`

- [ ] **Step 1: Create `src/renderer/src/stores/palette-store.ts`**

```ts
import { create } from 'zustand';

export type PaletteMode = 'commands' | 'files';

export interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  openPalette: (mode: PaletteMode) => void;
  close: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  mode: 'commands',
  openPalette: (mode) => set({ open: true, mode }),
  close: () => set({ open: false }),
}));
```

- [ ] **Step 2: Create `src/renderer/src/commands/palette-commands.ts`**

```ts
import { commandRegistry } from './command-registry';
import { usePaletteStore } from '../stores/palette-store';

export function registerPaletteCommands(): void {
  commandRegistry.register({
    id: 'workbench.commandPalette',
    title: 'Command Palette',
    category: 'View',
    run: () => usePaletteStore.getState().openPalette('commands'),
  });
  commandRegistry.register({
    id: 'workbench.quickOpen',
    title: 'Go to File…',
    category: 'File',
    run: () => usePaletteStore.getState().openPalette('files'),
  });
}
```

- [ ] **Step 3: Write the failing component test**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Palette } from './Palette';
import { usePaletteStore } from '../stores/palette-store';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { commandRegistry } from '../commands/command-registry';

beforeEach(() => {
  (commandRegistry as unknown as { commands: Map<string, unknown> }).commands.clear();
  useEditorStore.setState({ tabs: [], activePath: null });
  useWorkspaceStore.setState({ rootPath: '/proj', rootEntries: [], childrenByPath: {}, expandedPaths: {} });
  usePaletteStore.setState({ open: false, mode: 'commands' });
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    listFiles: vi.fn(async () => ({
      ok: true,
      data: [{ name: 'main.ts', path: '/proj/src/main.ts', relPath: 'src/main.ts' }],
    })),
    readFile: vi.fn(async () => ({ ok: true, data: 'body' })),
  };
});

describe('Palette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Palette />);
    expect(container.firstChild).toBeNull();
  });

  it('filters and runs a command', async () => {
    const run = vi.fn();
    commandRegistry.register({ id: 'x.do', title: 'Do The Thing', run });
    usePaletteStore.setState({ open: true, mode: 'commands' });
    render(<Palette />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'do thing' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/type a command/i), { key: 'Enter' });
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(usePaletteStore.getState().open).toBe(false);
  });

  it('quick-open lists files and opens the selection', async () => {
    usePaletteStore.setState({ open: true, mode: 'files' });
    render(<Palette />);
    await waitFor(() => expect(screen.getByText('main.ts')).toBeDefined());
    fireEvent.keyDown(screen.getByPlaceholderText(/go to file/i), { key: 'Enter' });
    await waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(1));
  });
});
```

- [ ] **Step 4: Run it — expect FAIL** (`npm run test -- Palette`).

- [ ] **Step 5: Create `src/renderer/src/components/Palette.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { commandRegistry } from '../commands/command-registry';
import { fuzzyMatch } from '../util/fuzzy';
import { usePaletteStore } from '../stores/palette-store';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import type { FileItem } from '@shared/ipc-contract';

interface Row {
  id: string;
  primary: string;
  secondary?: string;
  invoke: () => void | Promise<void>;
}

export function Palette(): React.JSX.Element | null {
  const open = usePaletteStore((s) => s.open);
  const mode = usePaletteStore((s) => s.mode);
  const close = usePaletteStore((s) => s.close);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);

  // Reset query/selection each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open, mode]);

  // Load files for quick-open.
  useEffect(() => {
    if (open && mode === 'files' && rootPath) {
      void window.forge.listFiles(rootPath).then((res) => {
        if (res.ok) setFiles(res.data);
      });
    }
  }, [open, mode, rootPath]);

  const rows: Row[] = useMemo(() => {
    if (mode === 'commands') {
      return commandRegistry.all().map((c) => ({
        id: c.id,
        primary: c.title,
        secondary: c.category,
        invoke: () => commandRegistry.run(c.id),
      }));
    }
    return files.map((f) => ({
      id: f.path,
      primary: f.name,
      secondary: f.relPath,
      invoke: async () => {
        const res = await window.forge.readFile(f.path);
        if (res.ok) openFile({ path: f.path, name: f.name, content: res.data });
      },
    }));
  }, [mode, files, openFile]);

  const filtered = useMemo(() => {
    const haystack = (r: Row): string => `${r.primary} ${r.secondary ?? ''}`;
    return rows
      .map((r) => ({ row: r, score: fuzzyMatch(query, haystack(r)) }))
      .filter((x) => x.score.matched)
      .sort((a, b) => b.score.score - a.score.score)
      .map((x) => x.row);
  }, [rows, query]);

  if (!open) return null;

  const runAt = (index: number): void => {
    const row = filtered[index];
    if (!row) return;
    close();
    void row.invoke();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          value={query}
          placeholder={mode === 'commands' ? 'Type a command…' : 'Go to file…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {filtered.map((row, i) => (
            <div
              key={row.id}
              className={`palette-row${i === activeIndex ? ' palette-row-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runAt(i)}
            >
              <span className="palette-primary">{row.primary}</span>
              {row.secondary ? <span className="palette-secondary">{row.secondary}</span> : null}
            </div>
          ))}
          {filtered.length === 0 ? <div className="palette-empty">No results</div> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run it — expect PASS** (`npm run test -- Palette`).

- [ ] **Step 7: Register palette commands at startup in `src/renderer/src/main.tsx`** — add import and call:

```tsx
import { registerPaletteCommands } from './commands/palette-commands';

registerPaletteCommands();
```

(place the call right after `registerCoreCommands();`)

- [ ] **Step 8: Mount `<Palette />` in `src/renderer/src/components/AppShell.tsx`** — import it and render it as the last child inside the root `.app-shell` div (after the statusbar):

```tsx
import { Palette } from './Palette';
```

and before the closing `</div>` of `.app-shell`:

```tsx
      <Palette />
```

- [ ] **Step 9: Append palette styles to `src/renderer/src/styles/global.css`**

```css
.palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 90px;
  z-index: 1000;
}

.palette {
  width: 560px;
  max-width: 90vw;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.palette-input {
  width: 100%;
  padding: 13px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--fg);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.palette-list {
  max-height: 360px;
  overflow-y: auto;
  padding: 6px;
}

.palette-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.palette-row-active {
  background: var(--accent-soft);
}

.palette-primary {
  font-size: 13px;
  color: var(--fg);
}

.palette-secondary {
  font-size: 11px;
  color: var(--fg-faint);
}

.palette-empty {
  padding: 14px 10px;
  font-size: 13px;
  color: var(--fg-faint);
  text-align: center;
}
```

- [ ] **Step 10: Full gate** (`npm run test && npm run type-check && npm run build`) — expect all green.

- [ ] **Step 11: Manual verify**

Run: `pnpm dev`
Expected: ⌘⇧P opens the command palette (type "toggle" → run Toggle Sidebar); ⌘P opens quick-open (type a filename → Enter opens it); ⌘S saves; ⌘B toggles the sidebar; Esc closes the palette; arrow keys move the selection.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: command palette and fuzzy quick-open"
```

---

## Self-Review

**Spec coverage (Phase 2 — spine portion):** command registry (Task 1) ✓; command palette (Task 5) ✓; quick-open (Tasks 4–5) ✓; keybinding service + dispatch (Task 3) ✓; commands route through the registry (all tasks) ✓. Themes + keybinding **overrides persistence** + layout persistence are Phase 2b.

**Placeholder scan:** Task 4 deliberately shows a throwaway signature then the clean version with an explicit "use the clean version" instruction; the clean version is complete. No TBD/TODO elsewhere.

**Type consistency:** `Command`/`commandRegistry` API consistent across registry, core/palette commands, keybinding dispatch, and Palette. `FileItem` defined once (Task 4) and consumed by fs-service, preload, and Palette. `PaletteMode`/`PaletteState` consistent between store, commands, and component. Keybinding command ids (`file.save`, `view.toggleSidebar`, `workbench.commandPalette`, `workbench.quickOpen`) match the ids registered in Tasks 1 and 5.

**Known follow-ups (Phase 2b):** theme service + built-in dark/light + theme toggle command; settings-service persistence for theme, sidebar visibility, and keybinding overrides (the `useKeybindings(overrides)` param is already wired to accept them).
