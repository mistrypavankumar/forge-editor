# Forge Editor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a `forge` command on `PATH` and set editor environment variables in the user's shell profile so external tools open files in Forge with no per-project `.env` config — triggered by a first-run consent prompt and palette commands.

**Architecture:** A pure main-process module edits the shell profile inside an idempotent marked block and writes a `forge` shim to `~/.local/bin`. IPC exposes install/uninstall/status to the renderer, which drives a one-time consent dialog (gated by a settings flag) and two command-palette commands. Phase 1 wires the non-blocking dev-tool vars (`REACT_EDITOR`/`LAUNCH_EDITOR`); Phase 2 adds a CLI socket + `--wait` so `EDITOR`/`VISUAL`/git work.

**Tech Stack:** Electron 33, TypeScript 5 (strict), React 19, Zustand, Vitest, Node `node:fs`/`node:net`/`node:os`/`node:path`.

## Global Constraints

- Language: TypeScript strict — no `any`; named exports; props/interfaces adjacent to use.
- IPC handlers return `Result<T>` (`@shared/result`), wrapped with `toResult(...)`.
- All IPC channel names are added to `IpcChannels` in `src/shared/ipc-contract.ts`; preload methods added to both the `ForgeApi` interface (same file) and `src/preload/api.ts`.
- Settings live at `~/.forge/settings.json` via `readSettings`/`writeSettings` (`src/main/settings/settings-service.ts`).
- Platform: macOS-first (matches Forge's primary target). Windows/Linux profile handling is out of scope.
- Tests: Vitest, co-located `*.test.ts`. Run a single file with `npx vitest run <path>`.
- Marked block markers (exact, verbatim): start `# >>> forge editor integration >>>`, end `# <<< forge editor integration <<<`.
- Env values (exact): Phase 1 → `export REACT_EDITOR=forge`, `export LAUNCH_EDITOR=forge`, `export PATH="$HOME/.local/bin:$PATH"`. Phase 2 adds → `export EDITOR='forge --wait'`, `export VISUAL='forge --wait'`. `REACT_EDITOR`/`LAUNCH_EDITOR` are the bare name `forge` (no args — `launch-editor` treats the env value as a literal binary name).

---

## PHASE 1 — Dev-tool integration (non-blocking)

## File Structure (Phase 1)

- Create `src/main/editor-integration/shell-profile.ts` — pure marked-block + profile-path helpers (no Electron, no fs).
- Create `src/main/editor-integration/shell-profile.test.ts`.
- Create `src/main/editor-integration/installer.ts` — shim text + install/uninstall/status (fs only; HOME-injectable).
- Create `src/main/editor-integration/installer.test.ts`.
- Create `src/main/ipc/editor-integration-ipc.ts` — `registerEditorIntegrationIpc(ipcMain)`.
- Modify `src/shared/ipc-contract.ts` — add channels, `EditorIntegrationStatus`, `ForgeApi` methods, `editorIntegrationPrompted` setting.
- Modify `src/preload/api.ts` — expose the three methods.
- Modify `src/main/index.ts` — call `registerEditorIntegrationIpc(ipcMain)`.
- Create `src/renderer/src/stores/editor-integration-store.ts` — dialog state + actions.
- Create `src/renderer/src/components/EditorIntegrationDialog.tsx` — the consent/result dialog.
- Modify `src/renderer/src/commands/core-commands.ts` — register install/uninstall commands.
- Modify `src/renderer/src/components/AppShell.tsx` — mount the dialog + first-run trigger.

---

### Task 1: Shell-profile pure helpers

**Files:**
- Create: `src/main/editor-integration/shell-profile.ts`
- Test: `src/main/editor-integration/shell-profile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BLOCK_START: string`, `BLOCK_END: string`
  - `buildBlock(bodyLines: string[]): string` — body wrapped in markers, no trailing newline.
  - `upsertBlock(content: string, bodyLines: string[]): string` — replaces an existing marked block in place, else appends it (separated by a blank line). Returns full new content ending in a single newline.
  - `removeBlock(content: string): string` — strips the marked block and any blank line left in its place.
  - `hasBlock(content: string): boolean`
  - `profilePathForShell(shell: string | undefined, home: string): string` — `~/.zshrc` for zsh (default), `~/.bashrc` for bash, `~/.profile` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/editor-integration/shell-profile.test.ts
import { describe, it, expect } from 'vitest';
import {
  BLOCK_START,
  BLOCK_END,
  buildBlock,
  upsertBlock,
  removeBlock,
  hasBlock,
  profilePathForShell,
} from './shell-profile';

const BODY = ['export PATH="$HOME/.local/bin:$PATH"', 'export REACT_EDITOR=forge'];

describe('buildBlock', () => {
  it('wraps body lines in markers', () => {
    expect(buildBlock(BODY)).toBe(
      `${BLOCK_START}\nexport PATH="$HOME/.local/bin:$PATH"\nexport REACT_EDITOR=forge\n${BLOCK_END}`,
    );
  });
});

describe('upsertBlock', () => {
  it('appends a block to content without one, ending in a newline', () => {
    const out = upsertBlock('# my profile\nexport FOO=1\n', BODY);
    expect(out.startsWith('# my profile\nexport FOO=1\n')).toBe(true);
    expect(hasBlock(out)).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('replaces an existing block in place without duplicating it', () => {
    const first = upsertBlock('export FOO=1\n', BODY);
    const second = upsertBlock(first, ['export REACT_EDITOR=forge', 'export EDITOR=forge']);
    expect(second.match(new RegExp(BLOCK_START, 'g'))?.length).toBe(1);
    expect(second).toContain('export EDITOR=forge');
    expect(second).not.toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(second).toContain('export FOO=1');
  });
});

describe('removeBlock', () => {
  it('strips the block and preserves surrounding content', () => {
    const withBlock = upsertBlock('export FOO=1\n', BODY);
    const out = removeBlock(withBlock);
    expect(hasBlock(out)).toBe(false);
    expect(out).toContain('export FOO=1');
  });

  it('is a no-op when there is no block', () => {
    expect(removeBlock('export FOO=1\n')).toBe('export FOO=1\n');
  });
});

describe('profilePathForShell', () => {
  it('maps zsh to ~/.zshrc', () => {
    expect(profilePathForShell('/bin/zsh', '/Users/x')).toBe('/Users/x/.zshrc');
  });
  it('maps bash to ~/.bashrc', () => {
    expect(profilePathForShell('/bin/bash', '/Users/x')).toBe('/Users/x/.bashrc');
  });
  it('falls back to ~/.profile for unknown/undefined shells', () => {
    expect(profilePathForShell(undefined, '/Users/x')).toBe('/Users/x/.profile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/editor-integration/shell-profile.test.ts`
Expected: FAIL — `Cannot find module './shell-profile'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/editor-integration/shell-profile.ts
import { join } from 'node:path';

export const BLOCK_START = '# >>> forge editor integration >>>';
export const BLOCK_END = '# <<< forge editor integration <<<';

export function buildBlock(bodyLines: string[]): string {
  return [BLOCK_START, ...bodyLines, BLOCK_END].join('\n');
}

export function hasBlock(content: string): boolean {
  return content.includes(BLOCK_START) && content.includes(BLOCK_END);
}

/** Replace the existing marked block in `content`, or append a fresh one. */
export function upsertBlock(content: string, bodyLines: string[]): string {
  const block = buildBlock(bodyLines);
  if (hasBlock(content)) {
    const re = new RegExp(`${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}`);
    return ensureTrailingNewline(content.replace(re, block));
  }
  const base = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  return ensureTrailingNewline(`${base}\n${block}`);
}

/** Strip the marked block (and a single blank line left behind), if present. */
export function removeBlock(content: string): string {
  if (!hasBlock(content)) return content;
  const re = new RegExp(`\\n?${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}\\n?`);
  return content.replace(re, '\n').replace(/\n{3,}/g, '\n\n');
}

export function profilePathForShell(shell: string | undefined, home: string): string {
  const name = (shell ?? '').split('/').pop() ?? '';
  if (name.includes('zsh')) return join(home, '.zshrc');
  if (name.includes('bash')) return join(home, '.bashrc');
  return join(home, '.profile');
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/editor-integration/shell-profile.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/editor-integration/shell-profile.ts src/main/editor-integration/shell-profile.test.ts
git commit -m "feat(editor-integration): shell-profile marked-block helpers"
```

---

### Task 2: Installer (shim + profile mutation)

**Files:**
- Create: `src/main/editor-integration/installer.ts`
- Test: `src/main/editor-integration/installer.test.ts`

**Interfaces:**
- Consumes (Task 1): `upsertBlock`, `removeBlock`, `hasBlock`, `profilePathForShell`.
- Produces:
  - `interface IntegrationPaths { home: string; binDir: string; shimPath: string; profilePath: string; appBundle: string }`
  - `resolveIntegrationPaths(home: string, shell: string | undefined, appBundle: string): IntegrationPaths` — `binDir = $home/.local/bin`, `shimPath = $binDir/forge`.
  - `PHASE1_ENV_LINES: string[]` — `['export PATH="$HOME/.local/bin:$PATH"', 'export REACT_EDITOR=forge', 'export LAUNCH_EDITOR=forge']`.
  - `buildShim(appBundle: string): string` — the `forge` script.
  - `install(paths: IntegrationPaths, envLines?: string[]): Promise<void>` — writes shim (mode `0o755`), upserts block (defaults to `PHASE1_ENV_LINES`); creates `binDir` and the profile file if missing.
  - `uninstall(paths: IntegrationPaths): Promise<void>` — removes shim, strips block.
  - `status(paths: IntegrationPaths): Promise<{ installed: boolean }>` — `installed` = shim exists AND profile contains the block.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/editor-integration/installer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveIntegrationPaths,
  buildShim,
  install,
  uninstall,
  status,
  PHASE1_ENV_LINES,
} from './installer';

let home: string;
const APP = '/Applications/Forge.app';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'forge-home-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('buildShim', () => {
  it('opens the bundle via the macOS association, passing args through', () => {
    const shim = buildShim(APP);
    expect(shim.startsWith('#!/bin/sh\n')).toBe(true);
    expect(shim).toContain(`open -a "${APP}" "$@"`);
  });
});

describe('install/status/uninstall', () => {
  it('writes an executable shim and the profile block, reported installed', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);

    const shimStat = await fs.stat(paths.shimPath);
    expect(shimStat.mode & 0o111).not.toBe(0); // executable bit set

    const profile = await fs.readFile(paths.profilePath, 'utf8');
    for (const line of PHASE1_ENV_LINES) expect(profile).toContain(line);

    expect((await status(paths)).installed).toBe(true);
  });

  it('is idempotent — installing twice leaves one block', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);
    await install(paths);
    const profile = await fs.readFile(paths.profilePath, 'utf8');
    expect(profile.match(/forge editor integration >>>/g)?.length).toBe(1);
  });

  it('uninstall removes the shim and the block', async () => {
    const paths = resolveIntegrationPaths(home, '/bin/zsh', APP);
    await install(paths);
    await uninstall(paths);
    await expect(fs.stat(paths.shimPath)).rejects.toThrow();
    expect((await status(paths)).installed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/editor-integration/installer.test.ts`
Expected: FAIL — `Cannot find module './installer'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/editor-integration/installer.ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { upsertBlock, removeBlock, hasBlock } from './shell-profile';

export interface IntegrationPaths {
  home: string;
  binDir: string;
  shimPath: string;
  profilePath: string;
  appBundle: string;
}

export const PHASE1_ENV_LINES = [
  'export PATH="$HOME/.local/bin:$PATH"',
  'export REACT_EDITOR=forge',
  'export LAUNCH_EDITOR=forge',
];

// Imported lazily to keep this module free of Task 1's path helper in the signature above.
import { profilePathForShell } from './shell-profile';

export function resolveIntegrationPaths(
  home: string,
  shell: string | undefined,
  appBundle: string,
): IntegrationPaths {
  const binDir = join(home, '.local', 'bin');
  return {
    home,
    binDir,
    shimPath: join(binDir, 'forge'),
    profilePath: profilePathForShell(shell, home),
    appBundle,
  };
}

/** Phase 1 shim: non-blocking open via the macOS app association (routes through `open-file`). */
export function buildShim(appBundle: string): string {
  return [
    '#!/bin/sh',
    '# Forge editor integration. Opens files passed by $EDITOR / REACT_EDITOR / etc.',
    '# Phase 1: non-blocking open via the macOS app association.',
    `exec open -a "${appBundle}" "$@"`,
    '',
  ].join('\n');
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return '';
  }
}

export async function install(paths: IntegrationPaths, envLines = PHASE1_ENV_LINES): Promise<void> {
  await fs.mkdir(paths.binDir, { recursive: true });
  await fs.writeFile(paths.shimPath, buildShim(paths.appBundle), { mode: 0o755 });
  await fs.chmod(paths.shimPath, 0o755);
  const current = await readOrEmpty(paths.profilePath);
  await fs.writeFile(paths.profilePath, upsertBlock(current, envLines), 'utf8');
}

export async function uninstall(paths: IntegrationPaths): Promise<void> {
  await fs.rm(paths.shimPath, { force: true });
  const current = await readOrEmpty(paths.profilePath);
  if (current) await fs.writeFile(paths.profilePath, removeBlock(current), 'utf8');
}

export async function status(paths: IntegrationPaths): Promise<{ installed: boolean }> {
  const shimExists = await fs
    .stat(paths.shimPath)
    .then(() => true)
    .catch(() => false);
  const profile = await readOrEmpty(paths.profilePath);
  return { installed: shimExists && hasBlock(profile) };
}
```

> Note: the two `import` lines must be hoisted to the top of the file when writing it — they are shown split only for narrative. Put both `shell-profile` imports together at the top.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/editor-integration/installer.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/editor-integration/installer.ts src/main/editor-integration/installer.test.ts
git commit -m "feat(editor-integration): forge shim + profile installer"
```

---

### Task 3: IPC wiring + settings flag

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Create: `src/main/ipc/editor-integration-ipc.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes (Task 2): `resolveIntegrationPaths`, `install`, `uninstall`, `status`.
- Produces:
  - `IpcChannels.editorIntegrationStatus = 'forge:editor-integration:status'`, `...Install = '...:install'`, `...Uninstall = '...:uninstall'`.
  - `interface EditorIntegrationStatus { installed: boolean; shimPath: string; profilePath: string }`
  - `ForgeApi.editorIntegrationStatus()`, `.installEditorIntegration()`, `.uninstallEditorIntegration()` — each `Promise<Result<EditorIntegrationStatus>>`.
  - `ForgeSettings.editorIntegrationPrompted?: boolean`.
  - `registerEditorIntegrationIpc(ipcMain: IpcMain): void`.

- [ ] **Step 1: Add channels, types, settings flag, and ForgeApi methods to the contract**

In `src/shared/ipc-contract.ts`, add to the `IpcChannels` object (near the AWS block):

```ts
  // Editor integration: install/remove the `forge` PATH command + shell-profile env vars.
  editorIntegrationStatus: 'forge:editor-integration:status',
  editorIntegrationInstall: 'forge:editor-integration:install',
  editorIntegrationUninstall: 'forge:editor-integration:uninstall',
```

Add the status interface (place it near `AwsActive`):

```ts
/** State of the system editor integration: the `forge` shim + shell-profile env block. */
export interface EditorIntegrationStatus {
  installed: boolean;
  /** Absolute path of the installed `forge` shim (whether or not it exists yet). */
  shimPath: string;
  /** Shell profile the env block is written to (e.g. ~/.zshrc). */
  profilePath: string;
}
```

Add to `ForgeSettings`:

```ts
  /** Set once the first-run "set Forge as default editor" prompt has been shown. */
  editorIntegrationPrompted?: boolean;
```

Add to the `ForgeApi` interface (near the AWS methods):

```ts
  /** Current state of the `forge` PATH command + shell-profile env integration. */
  editorIntegrationStatus: () => Promise<Result<EditorIntegrationStatus>>;
  /** Install the `forge` shim and write the editor env vars to the shell profile. */
  installEditorIntegration: () => Promise<Result<EditorIntegrationStatus>>;
  /** Remove the `forge` shim and the editor env-var block from the shell profile. */
  uninstallEditorIntegration: () => Promise<Result<EditorIntegrationStatus>>;
```

- [ ] **Step 2: Write the IPC registrar**

```ts
// src/main/ipc/editor-integration-ipc.ts
import type { IpcMain } from 'electron';
import { app } from 'electron';
import { homedir } from 'node:os';
import { IpcChannels, type EditorIntegrationStatus } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import {
  resolveIntegrationPaths,
  install,
  uninstall,
  status,
  type IntegrationPaths,
} from '../editor-integration/installer';

/** The Forge.app bundle path, derived from the running executable (…/Forge.app/Contents/MacOS/Forge). */
function appBundlePath(): string {
  return app.getPath('exe').replace(/\/Contents\/MacOS\/[^/]+$/, '');
}

function currentPaths(): IntegrationPaths {
  return resolveIntegrationPaths(homedir(), process.env.SHELL, appBundlePath());
}

async function toStatus(paths: IntegrationPaths): Promise<EditorIntegrationStatus> {
  const { installed } = await status(paths);
  return { installed, shimPath: paths.shimPath, profilePath: paths.profilePath };
}

export function registerEditorIntegrationIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.editorIntegrationStatus, () =>
    toResult(() => toStatus(currentPaths())),
  );
  ipcMain.handle(IpcChannels.editorIntegrationInstall, () =>
    toResult(async () => {
      const paths = currentPaths();
      await install(paths);
      return toStatus(paths);
    }),
  );
  ipcMain.handle(IpcChannels.editorIntegrationUninstall, () =>
    toResult(async () => {
      const paths = currentPaths();
      await uninstall(paths);
      return toStatus(paths);
    }),
  );
}
```

- [ ] **Step 3: Expose the methods in preload**

In `src/preload/api.ts`, add inside the `api` object (after the AWS methods):

```ts
  editorIntegrationStatus: () => ipcRenderer.invoke(IpcChannels.editorIntegrationStatus),
  installEditorIntegration: () => ipcRenderer.invoke(IpcChannels.editorIntegrationInstall),
  uninstallEditorIntegration: () => ipcRenderer.invoke(IpcChannels.editorIntegrationUninstall),
```

- [ ] **Step 4: Register the handlers in main**

In `src/main/index.ts`, add the import alongside the other `./ipc/*` imports:

```ts
import { registerEditorIntegrationIpc } from './ipc/editor-integration-ipc';
```

And call it in `app.whenReady()` next to `registerAwsIpc(ipcMain, SETTINGS_PATH)`:

```ts
registerEditorIntegrationIpc(ipcMain);
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm type-check`
Expected: no errors (the new `ForgeApi` methods are implemented in preload; `EditorIntegrationStatus` resolves).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc/editor-integration-ipc.ts src/preload/api.ts src/main/index.ts
git commit -m "feat(editor-integration): IPC + preload + settings flag"
```

---

### Task 4: Renderer — commands + first-run consent dialog

**Files:**
- Create: `src/renderer/src/stores/editor-integration-store.ts`
- Test: `src/renderer/src/stores/editor-integration-store.test.ts`
- Create: `src/renderer/src/components/EditorIntegrationDialog.tsx`
- Modify: `src/renderer/src/commands/core-commands.ts`
- Modify: `src/renderer/src/components/AppShell.tsx`

**Interfaces:**
- Consumes (Task 3): `window.forge.editorIntegrationStatus/installEditorIntegration/uninstallEditorIntegration`, `window.forge.loadSettings/saveSettings`.
- Produces: `useEditorIntegrationStore` with state `{ open: boolean; busy: boolean; message: string | null; installed: boolean }` and actions `openDialog()`, `close()`, `runInstall()`, `runUninstall()`, `maybePromptFirstRun()`.

- [ ] **Step 1: Write the failing store test**

```ts
// src/renderer/src/stores/editor-integration-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorIntegrationStore } from './editor-integration-store';

const forge = {
  editorIntegrationStatus: vi.fn(),
  installEditorIntegration: vi.fn(),
  uninstallEditorIntegration: vi.fn(),
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error partial window.forge for the test
  globalThis.window = { forge };
  useEditorIntegrationStore.setState({ open: false, busy: false, message: null, installed: false });
});

describe('runInstall', () => {
  it('installs, marks prompted, and records the new status', async () => {
    forge.installEditorIntegration.mockResolvedValue({
      ok: true,
      data: { installed: true, shimPath: '/h/.local/bin/forge', profilePath: '/h/.zshrc' },
    });
    forge.loadSettings.mockResolvedValue({ ok: true, data: {} });
    forge.saveSettings.mockResolvedValue({ ok: true, data: undefined });

    await useEditorIntegrationStore.getState().runInstall();

    expect(forge.installEditorIntegration).toHaveBeenCalledOnce();
    expect(forge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ editorIntegrationPrompted: true }),
    );
    expect(useEditorIntegrationStore.getState().installed).toBe(true);
    expect(useEditorIntegrationStore.getState().busy).toBe(false);
  });

  it('surfaces an error message on failure', async () => {
    forge.installEditorIntegration.mockResolvedValue({ ok: false, error: 'EACCES' });
    forge.loadSettings.mockResolvedValue({ ok: true, data: {} });
    forge.saveSettings.mockResolvedValue({ ok: true, data: undefined });

    await useEditorIntegrationStore.getState().runInstall();

    expect(useEditorIntegrationStore.getState().message).toContain('EACCES');
    expect(useEditorIntegrationStore.getState().installed).toBe(false);
  });
});

describe('maybePromptFirstRun', () => {
  it('opens the dialog when not previously prompted', async () => {
    forge.loadSettings.mockResolvedValue({ ok: true, data: {} });
    forge.editorIntegrationStatus.mockResolvedValue({
      ok: true,
      data: { installed: false, shimPath: '', profilePath: '' },
    });
    await useEditorIntegrationStore.getState().maybePromptFirstRun();
    expect(useEditorIntegrationStore.getState().open).toBe(true);
  });

  it('does nothing when already prompted', async () => {
    forge.loadSettings.mockResolvedValue({ ok: true, data: { editorIntegrationPrompted: true } });
    await useEditorIntegrationStore.getState().maybePromptFirstRun();
    expect(useEditorIntegrationStore.getState().open).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/stores/editor-integration-store.test.ts`
Expected: FAIL — `Cannot find module './editor-integration-store'`.

- [ ] **Step 3: Write the store**

```ts
// src/renderer/src/stores/editor-integration-store.ts
import { create } from 'zustand';

interface EditorIntegrationState {
  open: boolean;
  busy: boolean;
  message: string | null;
  installed: boolean;
  openDialog: () => Promise<void>;
  close: () => void;
  runInstall: () => Promise<void>;
  runUninstall: () => Promise<void>;
  maybePromptFirstRun: () => Promise<void>;
}

async function markPrompted(): Promise<void> {
  const res = await window.forge.loadSettings();
  const settings = res.ok ? res.data : {};
  await window.forge.saveSettings({ ...settings, editorIntegrationPrompted: true });
}

export const useEditorIntegrationStore = create<EditorIntegrationState>((set) => ({
  open: false,
  busy: false,
  message: null,
  installed: false,

  openDialog: async () => {
    const res = await window.forge.editorIntegrationStatus();
    set({ open: true, message: null, installed: res.ok ? res.data.installed : false });
  },

  close: () => set({ open: false }),

  runInstall: async () => {
    set({ busy: true, message: null });
    const res = await window.forge.installEditorIntegration();
    await markPrompted();
    if (res.ok) {
      set({ busy: false, installed: true, message: `Installed. Restart your terminal to use it.` });
    } else {
      set({ busy: false, message: `Could not install: ${res.error}` });
    }
  },

  runUninstall: async () => {
    set({ busy: true, message: null });
    const res = await window.forge.uninstallEditorIntegration();
    if (res.ok) set({ busy: false, installed: false, message: 'Removed.' });
    else set({ busy: false, message: `Could not remove: ${res.error}` });
  },

  maybePromptFirstRun: async () => {
    const res = await window.forge.loadSettings();
    if (res.ok && res.data.editorIntegrationPrompted) return;
    const status = await window.forge.editorIntegrationStatus();
    set({ open: true, message: null, installed: status.ok ? status.data.installed : false });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/stores/editor-integration-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the dialog component**

Model styling on `src/renderer/src/components/AwsConnectionPicker.tsx` (same Tailwind tokens). Keep it presentational over the store.

```tsx
// src/renderer/src/components/EditorIntegrationDialog.tsx
import { useEditorIntegrationStore } from '../stores/editor-integration-store';

export function EditorIntegrationDialog(): JSX.Element | null {
  const { open, busy, message, installed, close, runInstall, runUninstall } =
    useEditorIntegrationStore();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={close}
    >
      <div
        className="w-[28rem] rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-neutral-100">
          Set Forge as your default editor?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          Installs the <code className="text-neutral-200">forge</code> command and sets the editor
          environment variables so dev tools open files in Forge — no per-project config.
        </p>
        {message && <p className="mt-3 text-xs text-neutral-300">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            onClick={close}
            disabled={busy}
          >
            Not now
          </button>
          {installed ? (
            <button
              className="rounded bg-red-600/80 px-3 py-1.5 text-xs text-white hover:bg-red-600 disabled:opacity-50"
              onClick={() => void runUninstall()}
              disabled={busy}
            >
              Remove
            </button>
          ) : (
            <button
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
              onClick={() => void runInstall()}
              disabled={busy}
            >
              {busy ? 'Setting up…' : 'Set up'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the palette commands**

In `src/renderer/src/commands/core-commands.ts`, add the import at the top:

```ts
import { useEditorIntegrationStore } from '../stores/editor-integration-store';
```

And register inside `registerCoreCommands()`:

```ts
  commandRegistry.register({
    id: 'editorIntegration.setup',
    title: 'Shell Command: Install `forge` & set as default editor',
    category: 'Preferences',
    run: () => void useEditorIntegrationStore.getState().openDialog(),
  });
  commandRegistry.register({
    id: 'editorIntegration.uninstall',
    title: 'Shell Command: Remove `forge` editor integration',
    category: 'Preferences',
    run: () => void useEditorIntegrationStore.getState().runUninstall(),
  });
```

- [ ] **Step 7: Mount the dialog + trigger first-run in AppShell**

In `src/renderer/src/components/AppShell.tsx`: import the dialog and store, render `<EditorIntegrationDialog />` once near the top-level tree, and trigger the first-run prompt once on mount:

```tsx
import { EditorIntegrationDialog } from './EditorIntegrationDialog';
import { useEditorIntegrationStore } from '../stores/editor-integration-store';
// …inside the component body:
useEffect(() => {
  void useEditorIntegrationStore.getState().maybePromptFirstRun();
}, []);
// …in the returned JSX (top level of the shell):
<EditorIntegrationDialog />
```

- [ ] **Step 8: Type-check, lint, build**

Run: `pnpm type-check && pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/stores/editor-integration-store.ts \
        src/renderer/src/stores/editor-integration-store.test.ts \
        src/renderer/src/components/EditorIntegrationDialog.tsx \
        src/renderer/src/commands/core-commands.ts \
        src/renderer/src/components/AppShell.tsx
git commit -m "feat(editor-integration): first-run dialog + palette commands"
```

- [ ] **Step 10: Manual verification (Phase 1 acceptance)**

1. `pnpm build && pnpm dist:mac` (or run the packaged build); launch Forge → accept the first-run prompt.
2. New terminal: `which forge` → `~/.local/bin/forge`; `echo $REACT_EDITOR` → `forge`.
3. In an SCM-client checkout with no `REACT_EDITOR` in `.env.local`, start the dev server and click "Open in editor" in the Component Graph Inspector → the file opens in Forge.

---

## PHASE 2 — Blocking `$EDITOR` via a CLI socket + `--wait`

## File Structure (Phase 2)

- Create `src/main/editor-integration/cli-protocol.ts` — pure request/response framing + arg parsing.
- Create `src/main/editor-integration/cli-protocol.test.ts`.
- Create `src/main/editor-integration/cli-server.ts` — unix-socket server in the primary instance.
- Create `src/main/editor-integration/cli-client.ts` — `--cli` codepath: connect, send, optionally wait.
- Modify `src/main/index.ts` — intercept `--cli` before window creation; start the server; notify on editor close.
- Modify `src/main/editor-integration/installer.ts` — Phase 2 shim (`exec "<binary>" --cli "$@"`) + `PHASE2_ENV_LINES`.
- Modify `src/shared/ipc-contract.ts` — `IpcChannels.editorClosed` so the renderer reports a closed `--wait` file back to main.
- Modify `src/preload/api.ts` + renderer close handler — emit `editorClosed` when a wait-opened tab closes.

### Task 5: CLI protocol + socket server (no wiring yet)

**Files:**
- Create: `src/main/editor-integration/cli-protocol.ts`, `…/cli-protocol.test.ts`
- Create: `src/main/editor-integration/cli-server.ts`

**Interfaces:**
- Produces:
  - `interface CliRequest { files: string[]; wait: boolean }`
  - `parseCliArgs(argv: string[]): CliRequest` — splits on `--wait`, drops flags, strips `:line:col` to the path. (`forge --wait /a/b.ts:3:1` → `{ files: ['/a/b.ts'], wait: true }`.)
  - `encode(msg: object): string` / `decode(line: string): unknown` — newline-delimited JSON framing.
  - `socketPath(runtimeDir: string): string` — `join(runtimeDir, 'forge-cli.sock')`.
  - `startCliServer(socketFile: string, onOpen: (req: CliRequest, done: () => void) => void): Promise<import('node:net').Server>` — listens; for each request calls `onOpen` with a `done` callback the caller invokes when the file closes (for `--wait`), which writes a `{ closed: true }` line and ends that client socket. Non-wait requests are answered immediately.

- [ ] **Step 1: Failing test for arg parsing + framing**

```ts
// src/main/editor-integration/cli-protocol.test.ts
import { describe, it, expect } from 'vitest';
import { parseCliArgs, encode, decode, socketPath } from './cli-protocol';

describe('parseCliArgs', () => {
  it('parses a plain open', () => {
    expect(parseCliArgs(['/a/b.ts'])).toEqual({ files: ['/a/b.ts'], wait: false });
  });
  it('parses --wait and strips :line:col', () => {
    expect(parseCliArgs(['--wait', '/a/b.ts:12:3'])).toEqual({ files: ['/a/b.ts'], wait: true });
  });
});

describe('framing', () => {
  it('round-trips a message', () => {
    expect(decode(encode({ closed: true }))).toEqual({ closed: true });
  });
});

describe('socketPath', () => {
  it('builds under the runtime dir', () => {
    expect(socketPath('/run/forge')).toBe('/run/forge/forge-cli.sock');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './cli-protocol'`).

Run: `npx vitest run src/main/editor-integration/cli-protocol.test.ts`

- [ ] **Step 3: Implement `cli-protocol.ts`**

```ts
// src/main/editor-integration/cli-protocol.ts
import { join } from 'node:path';

export interface CliRequest {
  files: string[];
  wait: boolean;
}

export function parseCliArgs(argv: string[]): CliRequest {
  let wait = false;
  const files: string[] = [];
  for (const arg of argv) {
    if (arg === '--wait' || arg === '-w') {
      wait = true;
      continue;
    }
    if (arg.startsWith('-')) continue;
    files.push(arg.split(':')[0]);
  }
  return { files, wait };
}

export function encode(msg: object): string {
  return `${JSON.stringify(msg)}\n`;
}

export function decode(line: string): unknown {
  return JSON.parse(line.trim());
}

export function socketPath(runtimeDir: string): string {
  return join(runtimeDir, 'forge-cli.sock');
}
```

- [ ] **Step 4: Run → PASS.**

Run: `npx vitest run src/main/editor-integration/cli-protocol.test.ts`

- [ ] **Step 5: Implement `cli-server.ts`** (covered by the wiring test in Task 6; no standalone unit test)

```ts
// src/main/editor-integration/cli-server.ts
import net from 'node:net';
import { rmSync } from 'node:fs';
import { encode, decode, type CliRequest } from './cli-protocol';

/**
 * Listen on `socketFile` for CLI open requests. For each request, `onOpen` receives the parsed
 * request and a `done` callback; call `done()` when the opened file is closed in the editor —
 * the server then tells the waiting client to exit (unblocking git). Non-wait requests get an
 * immediate ack and the client exits at once.
 */
export async function startCliServer(
  socketFile: string,
  onOpen: (req: CliRequest, done: () => void) => void,
): Promise<net.Server> {
  rmSync(socketFile, { force: true }); // clear a stale socket from a crashed run
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      const req = decode(buf.slice(0, nl)) as CliRequest;
      onOpen(req, () => {
        socket.write(encode({ closed: true }));
        socket.end();
      });
      if (!req.wait) socket.end(); // ack-by-close for non-wait opens
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketFile, resolve);
  });
  return server;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/main/editor-integration/cli-protocol.ts \
        src/main/editor-integration/cli-protocol.test.ts \
        src/main/editor-integration/cli-server.ts
git commit -m "feat(editor-integration): CLI protocol + socket server"
```

---

### Task 6: Wire `--cli`/`--wait` end-to-end + upgrade shim & env block

**Files:**
- Create: `src/main/editor-integration/cli-client.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/editor-integration/installer.ts`
- Modify: `src/shared/ipc-contract.ts`, `src/preload/api.ts`
- Modify: the renderer editor-close path (`src/renderer/src/stores/editor-store.ts` close action or `src/renderer/src/commands/core-commands.ts`)

**Interfaces:**
- Consumes (Task 5): `parseCliArgs`, `socketPath`, `startCliServer`, `encode`, `decode`.
- Produces:
  - `runCliClient(socketFile: string, argv: string[]): Promise<number>` — connects, sends the request; if `wait`, resolves only after the `{ closed: true }` line; returns a process exit code. If the socket is absent (no running instance), returns a sentinel so the caller falls back to a normal launch.
  - `PHASE2_ENV_LINES` and a `wait`-capable `buildShim`.
  - `IpcChannels.editorClosed = 'forge:editor-integration:editorClosed'` and `ForgeApi.notifyEditorClosed(path: string): void`.

- [ ] **Step 1: Implement the CLI client**

```ts
// src/main/editor-integration/cli-client.ts
import net from 'node:net';
import { existsSync } from 'node:fs';
import { encode, decode, parseCliArgs } from './cli-protocol';

export const NO_INSTANCE = -1;

/** Connect to a running Forge and request the open; for --wait, resolve only once it's closed. */
export async function runCliClient(socketFile: string, argv: string[]): Promise<number> {
  if (!existsSync(socketFile)) return NO_INSTANCE;
  const req = parseCliArgs(argv);
  return new Promise<number>((resolve) => {
    const socket = net.createConnection(socketFile, () => socket.write(encode(req)));
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      if (buf.includes('\n')) {
        const msg = decode(buf) as { closed?: boolean };
        if (msg.closed) {
          socket.end();
          resolve(0);
        }
      }
    });
    // Non-wait: server closes after ack → resolve 0.
    socket.on('end', () => resolve(0));
    socket.on('error', () => resolve(NO_INSTANCE));
  });
}
```

- [ ] **Step 2: Intercept `--cli` in main, start the server, track waits**

In `src/main/index.ts`, **before** `app.requestSingleInstanceLock()`, add a CLI short-circuit. Maintain a map of path → pending `done` callbacks so an editor-close notification can release the waiter.

```ts
import { socketPath, startCliServer } from './editor-integration/cli-server-imports'; // see note
import { runCliClient, NO_INSTANCE } from './editor-integration/cli-client';
import { parseCliArgs } from './editor-integration/cli-protocol';

const CLI_SOCKET = socketPath(app.getPath('userData'));

// `forge --cli …` was exec'd by the shim. Run as a client and exit without opening a window.
if (process.argv.includes('--cli')) {
  const argv = process.argv.slice(process.argv.indexOf('--cli') + 1);
  runCliClient(CLI_SOCKET, argv).then((code) => {
    if (code === NO_INSTANCE) {
      // No running instance: fall back to launching normally with the file paths.
      const { files } = parseCliArgs(argv);
      for (const f of files) pendingOpenFiles.push(f);
      return; // continue into the normal startup below
    }
    app.exit(code);
  });
}
```

> Note: import `socketPath`/`startCliServer` directly from `./editor-integration/cli-protocol` and `./editor-integration/cli-server` respectively (the `cli-server-imports` alias above is shorthand — use the real module paths).

In `app.whenReady()`, start the server and wire close-tracking:

```ts
const waiters = new Map<string, () => void>();
await startCliServer(CLI_SOCKET, (req, done) => {
  for (const file of req.files) {
    requestOpenFile(file);
    if (req.wait) waiters.set(file, done);
    else done();
  }
});
ipcMain.on(IpcChannels.editorClosed, (_e, path: string) => {
  waiters.get(path)?.();
  waiters.delete(path);
});
```

- [ ] **Step 3: Renderer reports closed wait-files**

Add to `src/shared/ipc-contract.ts` → `IpcChannels`:

```ts
  editorClosed: 'forge:editor-integration:editorClosed',
```

Add to `ForgeApi`:

```ts
  /** Tell main a file opened for `$EDITOR --wait` was closed, so the waiting CLI (git) proceeds. */
  notifyEditorClosed: (path: string) => void;
```

Add to `src/preload/api.ts`:

```ts
  notifyEditorClosed: (path) => ipcRenderer.send(IpcChannels.editorClosed, path),
```

In the editor store's close action (`src/renderer/src/stores/editor-store.ts`), call `window.forge.notifyEditorClosed(path)` when a tab whose path is an absolute file is closed. (Main only has a waiter for paths it was asked to wait on, so notifying for every close is harmless.)

- [ ] **Step 4: Upgrade the shim and env block to Phase 2**

In `src/main/editor-integration/installer.ts`, change `buildShim` and add Phase 2 env lines:

```ts
export function buildShim(appBinary: string): string {
  return [
    '#!/bin/sh',
    '# Forge editor integration. Routes files through the running Forge instance.',
    '# `--wait` (used by $EDITOR/git) blocks until the file is closed in Forge.',
    `exec "${appBinary}" --cli "$@"`,
    '',
  ].join('\n');
}

export const PHASE2_ENV_LINES = [
  ...PHASE1_ENV_LINES,
  "export EDITOR='forge --wait'",
  "export VISUAL='forge --wait'",
];
```

`buildShim` now takes the **binary** path (`…/Contents/MacOS/Forge`), not the bundle — update `resolveIntegrationPaths`/the IPC `appBundlePath()` to pass `app.getPath('exe')`. Default `install()` to `PHASE2_ENV_LINES`. Update Task 2's `buildShim` test to assert `--cli "$@"` and the `installer.test.ts` env assertions to `PHASE2_ENV_LINES`.

- [ ] **Step 5: Type-check, lint, run all tests**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A src/main/editor-integration src/main/index.ts src/shared/ipc-contract.ts \
           src/preload/api.ts src/renderer/src/stores/editor-store.ts
git commit -m "feat(editor-integration): --wait CLI socket + EDITOR/VISUAL"
```

- [ ] **Step 7: Manual verification (Phase 2 acceptance)**

1. Reinstall via the palette command (rewrites the shim + block to Phase 2); open a new terminal.
2. `echo $EDITOR` → `forge --wait`.
3. In any repo: `git commit` (no `-m`) → Forge opens the `COMMIT_EDITMSG` file; the terminal **blocks**. Edit, save, close the tab → `git` proceeds with your message.
4. Confirm the dev-tool flow from Phase 1 still opens files.

---

## Self-Review

**Spec coverage:**
- First-run prompt + palette commands → Task 4. ✓
- All four env vars (`REACT_EDITOR`/`LAUNCH_EDITOR` Phase 1; `EDITOR`/`VISUAL` Phase 2) → Tasks 2 & 6. ✓
- `~/.local/bin/forge` + PATH export → Tasks 1 & 2. ✓
- Idempotent marked block, shell detection, missing-profile creation → Tasks 1 & 2 (tested). ✓
- `--wait` blocking for `$EDITOR`/git via socket → Tasks 5 & 6. ✓
- Phased delivery (dev-tool first, `$EDITOR` second) → Phase 1 / Phase 2 split. ✓
- Out of scope (line/column jump; GUI-launched servers; Windows/Linux) → not implemented, by design. ✓
- Error handling (`~/.local/bin` not writable, missing profile, idempotent reinstall) → `toResult` surfaces errors to the dialog (Task 3/4); missing profile created (Task 2). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The two narrative notes (split imports in Task 2; module-path note in Task 6 Step 2) are clarifications, not missing code.

**Type consistency:** `IntegrationPaths`, `EditorIntegrationStatus`, `CliRequest` names match across tasks. `buildShim` changes signature from bundle (Phase 1) to binary (Phase 2) — flagged explicitly in Task 6 Step 4 with the dependent test updates. `PHASE1_ENV_LINES`/`PHASE2_ENV_LINES` are used consistently.
