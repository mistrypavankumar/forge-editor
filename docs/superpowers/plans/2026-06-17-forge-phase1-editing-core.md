# Forge Phase 1 — Editing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty shell into a real editor — open a folder, browse it in a file tree, open files in tabs, edit them in Monaco, and save with dirty-state tracking. Find/replace comes free via Monaco's built-in widget.

**Architecture:** New main-process `fs-service` exposes folder-open dialog + directory/file read/write over typed IPC, all returning a `Result<T>` discriminated union (no thrown errors cross the process boundary). Two new Zustand stores hold renderer state: `workspace-store` (root path + lazily-expanded directory tree) and `editor-store` (open tabs, active tab, per-tab content + dirty flag). The `FileExplorer` renders the tree and opens files; `EditorPane` wraps a Monaco instance with a tab bar and Cmd/Ctrl+S save.

**Tech Stack:** Adds `monaco-editor` 0.52. Reuses Electron 33, React 19, TS strict, Zustand, Allotment, Vitest from Phase 0.

## Global Constraints

- Same as Phase 0: TS strict, no `any`, Electron security (contextIsolation/sandbox), shared IPC contract in `src/shared/`, named exports, max 2 function params (use an object for 3+).
- All IPC handlers return `Result<T>` — never throw across IPC.
- Monaco workers configured via Vite `?worker` imports (no CDN — must work offline / under `file://`).
- pnpm is the package manager; `monaco-editor` has no postinstall so no build-script approval needed.

---

### Task 1: Result type, fs IPC contract, and main-process fs-service

**Files:**
- Create: `src/shared/result.ts`
- Test: `src/shared/result.test.ts`
- Modify: `src/shared/ipc-contract.ts` (add channels + types + extend `ForgeApi`)
- Create: `src/main/fs/fs-service.ts`
- Test: `src/main/fs/fs-service.test.ts`
- Modify: `src/main/index.ts` (register fs handlers)
- Modify: `src/preload/api.ts` (expose fs methods)

**Interfaces:**
- Produces:
  - `type Result<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `ok<T>(data: T): Result<T>`, `err(error: string): Result<never>`, `toResult<T>(fn: () => Promise<T>): Promise<Result<T>>`
  - `interface DirEntry { name: string; path: string; isDirectory: boolean }`
  - `interface WorkspaceData { rootPath: string; tree: DirEntry[] }`
  - `ForgeApi` gains: `openFolder(): Promise<Result<WorkspaceData | null>>`, `readDirectory(path: string): Promise<Result<DirEntry[]>>`, `readFile(path: string): Promise<Result<string>>`, `writeFile(path: string, content: string): Promise<Result<void>>`
  - `sortDirEntries(entries: DirEntry[]): DirEntry[]`, `readDirectoryEntries(dirPath: string): Promise<DirEntry[]>`, `readFileText(filePath): Promise<string>`, `writeFileText(filePath, content): Promise<void>`

- [ ] **Step 1: Write the failing test for `result.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { err, ok, toResult } from './result';

describe('result', () => {
  it('ok wraps data', () => {
    expect(ok(5)).toEqual({ ok: true, data: 5 });
  });

  it('err wraps an error message', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('toResult returns ok on success', async () => {
    expect(await toResult(async () => 'hi')).toEqual({ ok: true, data: 'hi' });
  });

  it('toResult returns err on throw', async () => {
    const r = await toResult(async () => {
      throw new Error('nope');
    });
    expect(r).toEqual({ ok: false, error: 'nope' });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- result`) — cannot find `./result`.

- [ ] **Step 3: Create `src/shared/result.ts`**

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = (error: string): Result<never> => ({ ok: false, error });

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- result`).

- [ ] **Step 5: Extend `src/shared/ipc-contract.ts`** (replace whole file)

```ts
import type { Result } from './result';

export const IpcChannels = {
  ping: 'forge:ping',
  openFolder: 'forge:fs:openFolder',
  readDirectory: 'forge:fs:readDirectory',
  readFile: 'forge:fs:readFile',
  writeFile: 'forge:fs:writeFile',
} as const;

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface WorkspaceData {
  rootPath: string;
  tree: DirEntry[];
}

export interface ForgeApi {
  ping: (msg: string) => Promise<string>;
  openFolder: () => Promise<Result<WorkspaceData | null>>;
  readDirectory: (path: string) => Promise<Result<DirEntry[]>>;
  readFile: (path: string) => Promise<Result<string>>;
  writeFile: (path: string, content: string) => Promise<Result<void>>;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
```

- [ ] **Step 6: Write the failing test for `fs-service`**

```ts
// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDirectoryEntries, readFileText, sortDirEntries, writeFileText } from './fs-service';

describe('fs-service', () => {
  it('sortDirEntries lists directories before files, alphabetically', () => {
    const sorted = sortDirEntries([
      { name: 'b.ts', path: '/b.ts', isDirectory: false },
      { name: 'src', path: '/src', isDirectory: true },
      { name: 'a.ts', path: '/a.ts', isDirectory: false },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['src', 'a.ts', 'b.ts']);
  });

  it('readDirectoryEntries returns sorted entries for a real dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'file.txt'), 'x');
    const entries = await readDirectoryEntries(dir);
    expect(entries.map((e) => e.name)).toEqual(['sub', 'file.txt']);
    expect(entries[0].isDirectory).toBe(true);
  });

  it('writeFileText then readFileText round-trips', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    const file = join(dir, 'note.txt');
    await writeFileText(file, 'hello');
    expect(await readFileText(file)).toBe('hello');
  });
});
```

- [ ] **Step 7: Run it — expect FAIL** (`npm run test -- fs-service`).

- [ ] **Step 8: Create `src/main/fs/fs-service.ts`**

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DirEntry } from '@shared/ipc-contract';

export function sortDirEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readDirectoryEntries(dirPath: string): Promise<DirEntry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries: DirEntry[] = dirents.map((d) => ({
    name: d.name,
    path: join(dirPath, d.name),
    isDirectory: d.isDirectory(),
  }));
  return sortDirEntries(entries);
}

export async function readFileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileText(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
}
```

- [ ] **Step 9: Run it — expect PASS** (`npm run test -- fs-service`).

- [ ] **Step 10: Register handlers in `src/main/index.ts`** — update imports and add handlers next to the existing `ping` handler.

Replace the import block:

```ts
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels, pongOf } from '@shared/ipc-contract';
import { ok, toResult } from '@shared/result';
import { readDirectoryEntries, readFileText, writeFileText } from './fs/fs-service';
```

Inside `app.whenReady().then(() => { ... })`, replace the single `ipcMain.handle` line with:

```ts
  ipcMain.handle(IpcChannels.ping, (_event, msg: string) => pongOf(msg));
  ipcMain.handle(IpcChannels.openFolder, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return ok(null);
    const rootPath = res.filePaths[0];
    return toResult(async () => ({ rootPath, tree: await readDirectoryEntries(rootPath) }));
  });
  ipcMain.handle(IpcChannels.readDirectory, (_e, path: string) =>
    toResult(() => readDirectoryEntries(path)),
  );
  ipcMain.handle(IpcChannels.readFile, (_e, path: string) => toResult(() => readFileText(path)));
  ipcMain.handle(IpcChannels.writeFile, (_e, path: string, content: string) =>
    toResult(() => writeFileText(path, content)),
  );
```

- [ ] **Step 11: Expose fs methods in `src/preload/api.ts`** (replace whole file)

```ts
import { ipcRenderer } from 'electron';
import { IpcChannels, type ForgeApi } from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
  openFolder: () => ipcRenderer.invoke(IpcChannels.openFolder),
  readDirectory: (path) => ipcRenderer.invoke(IpcChannels.readDirectory, path),
  readFile: (path) => ipcRenderer.invoke(IpcChannels.readFile, path),
  writeFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeFile, path, content),
};
```

- [ ] **Step 12: Type-check** (`npm run type-check`) — expect exit 0.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add fs-service with typed Result-based IPC (open/read/write)"
```

---

### Task 2: Workspace store (root path + lazy directory tree)

**Files:**
- Create: `src/renderer/src/stores/workspace-store.ts`
- Test: `src/renderer/src/stores/workspace-store.test.ts`

**Interfaces:**
- Consumes: `DirEntry` (Task 1).
- Produces:
  - `interface WorkspaceState { rootPath: string | null; rootEntries: DirEntry[]; childrenByPath: Record<string, DirEntry[]>; expandedPaths: Record<string, boolean>; setWorkspace: (rootPath: string, entries: DirEntry[]) => void; setChildren: (path: string, entries: DirEntry[]) => void; toggleExpanded: (path: string) => void; }`
  - `useWorkspaceStore` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from './workspace-store';

const reset = () =>
  useWorkspaceStore.setState({
    rootPath: null,
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: {},
  });

describe('workspace-store', () => {
  beforeEach(reset);

  it('setWorkspace stores root path and entries', () => {
    useWorkspaceStore.getState().setWorkspace('/proj', [
      { name: 'src', path: '/proj/src', isDirectory: true },
    ]);
    const s = useWorkspaceStore.getState();
    expect(s.rootPath).toBe('/proj');
    expect(s.rootEntries).toHaveLength(1);
  });

  it('setChildren caches a directory\'s children', () => {
    useWorkspaceStore.getState().setChildren('/proj/src', [
      { name: 'a.ts', path: '/proj/src/a.ts', isDirectory: false },
    ]);
    expect(useWorkspaceStore.getState().childrenByPath['/proj/src']).toHaveLength(1);
  });

  it('toggleExpanded flips a directory open and closed', () => {
    useWorkspaceStore.getState().toggleExpanded('/proj/src');
    expect(useWorkspaceStore.getState().expandedPaths['/proj/src']).toBe(true);
    useWorkspaceStore.getState().toggleExpanded('/proj/src');
    expect(useWorkspaceStore.getState().expandedPaths['/proj/src']).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- workspace-store`).

- [ ] **Step 3: Create `src/renderer/src/stores/workspace-store.ts`**

```ts
import { create } from 'zustand';
import type { DirEntry } from '@shared/ipc-contract';

export interface WorkspaceState {
  rootPath: string | null;
  rootEntries: DirEntry[];
  childrenByPath: Record<string, DirEntry[]>;
  expandedPaths: Record<string, boolean>;
  setWorkspace: (rootPath: string, entries: DirEntry[]) => void;
  setChildren: (path: string, entries: DirEntry[]) => void;
  toggleExpanded: (path: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  rootPath: null,
  rootEntries: [],
  childrenByPath: {},
  expandedPaths: {},
  setWorkspace: (rootPath, entries) =>
    set({ rootPath, rootEntries: entries, childrenByPath: {}, expandedPaths: {} }),
  setChildren: (path, entries) =>
    set((s) => ({ childrenByPath: { ...s.childrenByPath, [path]: entries } })),
  toggleExpanded: (path) =>
    set((s) => ({ expandedPaths: { ...s.expandedPaths, [path]: !s.expandedPaths[path] } })),
}));
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- workspace-store`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/workspace-store.ts src/renderer/src/stores/workspace-store.test.ts
git commit -m "feat: add workspace store for root path and directory tree"
```

---

### Task 3: Editor store (tabs, active tab, content, dirty state)

**Files:**
- Create: `src/renderer/src/stores/editor-store.ts`
- Test: `src/renderer/src/stores/editor-store.test.ts`

**Interfaces:**
- Produces:
  - `interface OpenFile { path: string; name: string; content: string; dirty: boolean }`
  - `interface EditorState { tabs: OpenFile[]; activePath: string | null; openFile: (file: { path: string; name: string; content: string }) => void; closeFile: (path: string) => void; setActive: (path: string) => void; updateContent: (path: string, content: string) => void; markSaved: (path: string) => void; }`
  - `useEditorStore` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor-store';

const reset = () => useEditorStore.setState({ tabs: [], activePath: null });
const sample = { path: '/p/a.ts', name: 'a.ts', content: 'x' };

describe('editor-store', () => {
  beforeEach(reset);

  it('openFile adds a tab and activates it', () => {
    useEditorStore.getState().openFile(sample);
    const s = useEditorStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activePath).toBe('/p/a.ts');
    expect(s.tabs[0].dirty).toBe(false);
  });

  it('openFile on an already-open path does not duplicate, just activates', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().setActive('/p/a.ts');
    useEditorStore.getState().openFile(sample);
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().activePath).toBe('/p/a.ts');
  });

  it('updateContent marks the tab dirty', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().updateContent('/p/a.ts', 'changed');
    const tab = useEditorStore.getState().tabs[0];
    expect(tab.content).toBe('changed');
    expect(tab.dirty).toBe(true);
  });

  it('markSaved clears dirty', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().updateContent('/p/a.ts', 'changed');
    useEditorStore.getState().markSaved('/p/a.ts');
    expect(useEditorStore.getState().tabs[0].dirty).toBe(false);
  });

  it('closeFile removes the tab and picks a neighbor as active', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().openFile({ path: '/p/b.ts', name: 'b.ts', content: 'y' });
    useEditorStore.getState().closeFile('/p/b.ts');
    const s = useEditorStore.getState();
    expect(s.tabs.map((t) => t.path)).toEqual(['/p/a.ts']);
    expect(s.activePath).toBe('/p/a.ts');
  });

  it('closing the last tab sets activePath to null', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().closeFile('/p/a.ts');
    expect(useEditorStore.getState().activePath).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- editor-store`).

- [ ] **Step 3: Create `src/renderer/src/stores/editor-store.ts`**

```ts
import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export interface EditorState {
  tabs: OpenFile[];
  activePath: string | null;
  openFile: (file: { path: string; name: string; content: string }) => void;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activePath: null,
  openFile: (file) =>
    set((s) => {
      if (s.tabs.some((t) => t.path === file.path)) return { activePath: file.path };
      return { tabs: [...s.tabs, { ...file, dirty: false }], activePath: file.path };
    }),
  closeFile: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activePath = neighbor ? neighbor.path : null;
      }
      return { tabs, activePath };
    }),
  setActive: (path) => set({ activePath: path }),
  updateContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, dirty: true } : t)),
    })),
  markSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: false } : t)),
    })),
}));
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- editor-store`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/editor-store.ts src/renderer/src/stores/editor-store.test.ts
git commit -m "feat: add editor store for tabs and dirty tracking"
```

---

### Task 4: File explorer (open folder, tree, lazy expand, open file)

**Files:**
- Create: `src/renderer/src/components/FileExplorer.tsx`
- Test: `src/renderer/src/components/FileExplorer.test.tsx`
- Modify: `src/renderer/src/styles/global.css` (tree styling)

**Interfaces:**
- Consumes: `useWorkspaceStore` (Task 2), `useEditorStore` (Task 3), `window.forge` (Task 1).
- Produces: `FileExplorer` component — rendered into the sidebar region in Task 5.

- [ ] **Step 1: Write the failing component test**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';

beforeEach(() => {
  useWorkspaceStore.setState({
    rootPath: null,
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: {},
  });
  useEditorStore.setState({ tabs: [], activePath: null });
  (window as unknown as { forge: Record<string, unknown> }).forge = {
    openFolder: vi.fn(async () => ({
      ok: true,
      data: { rootPath: '/proj', tree: [{ name: 'a.ts', path: '/proj/a.ts', isDirectory: false }] },
    })),
    readFile: vi.fn(async () => ({ ok: true, data: 'file body' })),
    readDirectory: vi.fn(async () => ({ ok: true, data: [] })),
  };
});

describe('FileExplorer', () => {
  it('opens a folder and lists its entries', async () => {
    render(<FileExplorer />);
    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    await waitFor(() => expect(screen.getByText('a.ts')).toBeDefined());
  });

  it('clicking a file opens it as a tab', async () => {
    useWorkspaceStore.setState({
      rootPath: '/proj',
      rootEntries: [{ name: 'a.ts', path: '/proj/a.ts', isDirectory: false }],
    });
    render(<FileExplorer />);
    fireEvent.click(screen.getByText('a.ts'));
    await waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(1));
    expect(useEditorStore.getState().tabs[0].content).toBe('file body');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- FileExplorer`).

- [ ] **Step 3: Create `src/renderer/src/components/FileExplorer.tsx`**

```tsx
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import type { DirEntry } from '@shared/ipc-contract';

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedPaths[entry.path] ?? false);
  const children = useWorkspaceStore((s) => s.childrenByPath[entry.path]);
  const setChildren = useWorkspaceStore((s) => s.setChildren);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const openFile = useEditorStore((s) => s.openFile);

  const onClick = async (): Promise<void> => {
    if (entry.isDirectory) {
      toggleExpanded(entry.path);
      if (!expanded && children === undefined) {
        const res = await window.forge.readDirectory(entry.path);
        if (res.ok) setChildren(entry.path, res.data);
      }
      return;
    }
    const res = await window.forge.readFile(entry.path);
    if (res.ok) openFile({ path: entry.path, name: entry.name, content: res.data });
  };

  return (
    <>
      <div
        className="tree-node"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => void onClick()}
      >
        {entry.isDirectory ? (expanded ? '▾ ' : '▸ ') : '  '}
        {entry.name}
      </div>
      {entry.isDirectory && expanded
        ? (children ?? []).map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

export function FileExplorer(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const onOpenFolder = async (): Promise<void> => {
    const res = await window.forge.openFolder();
    if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
  };

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="explorer-title">{rootPath ?? 'No folder'}</span>
        <button type="button" onClick={() => void onOpenFolder()}>
          Open Folder
        </button>
      </div>
      <div className="explorer-tree">
        {rootEntries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- FileExplorer`).

- [ ] **Step 5: Add explorer styles to `src/renderer/src/styles/global.css`** (append)

```css
.explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  text-align: left;
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--forge-border);
}

.explorer-title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.explorer-tree {
  flex: 1;
  overflow: auto;
  font-size: 13px;
}

.tree-node {
  padding: 2px 8px;
  cursor: pointer;
  white-space: pre;
  user-select: none;
}

.tree-node:hover {
  background: var(--forge-border);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file explorer with lazy tree and file open"
```

---

### Task 5: Monaco editor pane, tab bar, and save — wired into the shell

**Files:**
- Create: `src/renderer/src/editor/monaco-setup.ts`
- Create: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/components/AppShell.tsx` (mount FileExplorer + EditorPane)
- Modify: `src/renderer/src/styles/global.css` (tab bar styling)

**Interfaces:**
- Consumes: `useEditorStore` (Task 3), `window.forge.writeFile` (Task 1).
- Produces: `EditorPane` component; `getMonaco()` accessor for the configured monaco namespace.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add monaco-editor@^0.52.2`
Expected: installs with no postinstall prompt.

- [ ] **Step 2: Create `src/renderer/src/editor/monaco-setup.ts`** (worker wiring for Vite; no CDN)

```ts
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

export function getMonaco(): typeof monaco {
  return monaco;
}
```

- [ ] **Step 3: Create `src/renderer/src/components/EditorPane.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useEditorStore } from '../stores/editor-store';

function languageFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html',
    md: 'markdown', py: 'python', go: 'go', rs: 'rust', sh: 'shell', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}

export function EditorPane(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, editor.ITextModel>>(new Map());

  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);
  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);

  // Create the Monaco instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const instance = monaco.editor.create(containerRef.current, {
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
    });
    editorRef.current = instance;
    const sub = instance.onDidChangeModelContent(() => {
      const model = instance.getModel();
      if (model) updateContent(model.uri.path, instance.getValue());
    });
    return () => {
      sub.dispose();
      instance.dispose();
    };
  }, [updateContent]);

  // Bind the active tab to a Monaco model (one model per path, preserving undo history).
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    if (!activePath) {
      instance.setModel(null);
      return;
    }
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) return;
    const monaco = getMonaco();
    let model = modelsRef.current.get(activePath);
    if (!model) {
      model = monaco.editor.createModel(
        tab.content,
        languageFor(tab.name),
        monaco.Uri.file(activePath),
      );
      modelsRef.current.set(activePath, model);
    }
    instance.setModel(model);
  }, [activePath, tabs]);

  // Dispose models for tabs that have been closed.
  useEffect(() => {
    const openPaths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [tabs]);

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

  return (
    <div className="editor-pane">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`tab${tab.path === activePath ? ' tab-active' : ''}`}
            onClick={() => setActive(tab.path)}
          >
            <span className="tab-name">
              {tab.name}
              {tab.dirty ? ' ●' : ''}
            </span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(tab.path);
              }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
      <div className="editor-host" ref={containerRef} />
    </div>
  );
}
```

- [ ] **Step 4: Mount both panes in `src/renderer/src/components/AppShell.tsx`** (replace whole file)

```tsx
import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';
import { FileExplorer } from './FileExplorer';
import { EditorPane } from './EditorPane';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const [pong, setPong] = useState('');

  useEffect(() => {
    void window.forge.ping('ready').then(setPong);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Allotment>
          {sidebarVisible && (
            <Allotment.Pane preferredSize={240} minSize={160}>
              <div className="region" data-testid="sidebar-region">
                <FileExplorer />
              </div>
            </Allotment.Pane>
          )}
          <Allotment.Pane>
            <div className="region" data-testid="editor-region" style={{ padding: 0 }}>
              <EditorPane />
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
      <div className="statusbar" data-testid="statusbar-region">
        Forge — {pong || 'connecting…'}
      </div>
    </div>
  );
}
```

Note: the existing AppShell test asserts the three regions render. `EditorPane` calls `getMonaco()` inside an effect; in jsdom `monaco.editor.create` may not fully work, but effects run after the assertions in that test. If the test errors, wrap the import: keep `EditorPane` mounted but the test only checks `getByTestId`, which resolves on render before effects complete. If jsdom throws from Monaco, mock it at the top of `AppShell.test.tsx`: `vi.mock('./EditorPane', () => ({ EditorPane: () => null }));`.

- [ ] **Step 5: Append editor styles to `src/renderer/src/styles/global.css`**

```css
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.tab-bar {
  display: flex;
  height: 32px;
  border-bottom: 1px solid var(--forge-border);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
  border-right: 1px solid var(--forge-border);
  white-space: nowrap;
}

.tab-active {
  background: var(--forge-border);
}

.tab-close {
  opacity: 0.6;
}

.tab-close:hover {
  opacity: 1;
}

.editor-host {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 6: Guard the AppShell test against Monaco in jsdom**

Add to the top of `src/renderer/src/components/AppShell.test.tsx`, after the imports:

```tsx
vi.mock('./EditorPane', () => ({ EditorPane: () => null }));
```

And add `vi` to its vitest import: `import { beforeAll, describe, expect, it, vi } from 'vitest';`

- [ ] **Step 7: Run the full suite** (`npm run test`) — expect all green.

- [ ] **Step 8: Type-check + build** (`npm run type-check && npm run build`) — expect exit 0 and a bundled renderer (Monaco makes the bundle large; that is expected).

- [ ] **Step 9: Manual verify**

Run: `pnpm dev`
Expected: click "Open Folder", pick a directory; the tree lists it; clicking a file opens it in a Monaco tab; typing shows a ● dirty dot; Cmd/Ctrl+S clears the dot and writes the file to disk; Ctrl/Cmd+F opens Monaco's find widget.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Monaco editor pane with tabs, save, and find"
```

---

## Self-Review

**Spec coverage (Phase 1):** Monaco wrapper (Task 5) ✓; open folder/workspace (Tasks 1, 4) ✓; file tree (Task 4) ✓; tabs (Tasks 3, 5) ✓; save + dirty state (Tasks 3, 5) ✓; find/replace (Monaco built-in, Task 5 step 9) ✓. Error handling via `Result<T>` across all IPC (Task 1) ✓.

**Placeholder scan:** No TBD/TODO; all code complete; commands have expected output.

**Type consistency:** `DirEntry`/`WorkspaceData`/`Result` defined once (Task 1) and consumed by stores/components. `OpenFile`/`EditorState` method names (`openFile`, `updateContent`, `markSaved`, `closeFile`, `setActive`) identical across editor-store (Task 3), FileExplorer (Task 4), and EditorPane (Task 5). `ForgeApi` methods match between contract, preload, and call sites.

**Known limitation (intentional, deferred to Phase 2):** Cmd/Ctrl+S is a direct window listener, not yet routed through a command/keybinding registry; the spec assigns that spine to Phase 2.
