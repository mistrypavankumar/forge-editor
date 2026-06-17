# Forge Phase 0 — Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a secure, type-safe Electron + React + TypeScript app shell that launches, with a typed IPC round-trip and a resizable empty-panel layout — the foundation every later phase builds on.

**Architecture:** `electron-vite` drives three entry points (main / preload / renderer). The renderer is React 19 + TS strict with no Node access; it talks to the main process only through a narrow, typed `contextBridge` API defined by a shared IPC contract. The app shell uses `Allotment` for resizable regions and a Zustand `layout-store` for panel visibility/sizes.

**Tech Stack:** Electron 33, electron-vite 3, Vite 6, React 19, TypeScript 5 (strict), Zustand 5, Allotment 1.20, Vitest 3.

## Global Constraints

- Node 22, npm 11 (already installed).
- TypeScript strict mode: `"strict": true`, no `any` (use `unknown` + type guards).
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer never imports Node/Electron modules directly — only `window.forge` from preload.
- All IPC channel names and payload types live in one shared `src/shared/ipc-contract.ts`; main and preload both import from it.
- Named exports preferred; `camelCase` locals, `PascalCase` components/types.
- Project root: `/Users/pavankumarmistry/Developer/forge`.

---

### Task 1: Project scaffold, configs, and launching shell

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`
- Create: `.gitignore`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable app — `npm run dev` opens a window rendering `App`. `npm run build` type-checks and bundles. `npm run test` runs Vitest. `npm run lint`/`type-check` available for later tasks.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "forge",
  "version": "0.0.0",
  "description": "Modern customizable code editor",
  "main": "./out/main/index.js",
  "author": "Pavankumar Mistry",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run type-check && electron-vite build",
    "preview": "electron-vite preview",
    "type-check": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.0",
    "electron-vite": "^3.0.0",
    "eslint": "^9.17.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "allotment": "^1.20.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` (renderer + shared, strict) and `tsconfig.node.json` (main/preload)**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/renderer/src", "src/shared", "src/preload"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/main", "src/preload", "src/shared", "electron.vite.config.ts"]
}
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  preload: {
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react()],
  },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', globals: true },
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
out
dist
*.log
.DS_Store
```

- [ ] **Step 6: Create the main process entry `src/main/index.ts`**

```ts
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 7: Create a minimal preload `src/preload/index.ts`** (the typed bridge arrives in Task 3)

```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('forge', {});
```

- [ ] **Step 8: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `src/renderer/src/main.tsx` and `src/renderer/src/App.tsx`**

`main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`App.tsx`:

```tsx
export function App(): React.JSX.Element {
  return <h1>Forge</h1>;
}
```

- [ ] **Step 10: Install dependencies**

Run: `cd /Users/pavankumarmistry/Developer/forge && npm install`
Expected: dependencies install with no peer-dependency errors.

- [ ] **Step 11: Verify type-check passes**

Run: `npm run type-check`
Expected: exits 0, no errors.

- [ ] **Step 12: Verify the app launches**

Run: `npm run dev` (then close the window after confirming)
Expected: an Electron window opens displaying "Forge". Stop with Ctrl-C.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite + react + ts strict app shell"
```

---

### Task 2: Layout store (Zustand) with panel visibility and sizes

**Files:**
- Create: `src/renderer/src/stores/layout-store.ts`
- Test: `src/renderer/src/stores/layout-store.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the build setup.
- Produces:
  - `type PanelId = 'sidebar' | 'panel'`
  - `interface LayoutState { sidebarVisible: boolean; panelVisible: boolean; togglePanel: (id: PanelId) => void; setPanelVisible: (id: PanelId, visible: boolean) => void; }`
  - `const useLayoutStore: UseBoundStore<StoreApi<LayoutState>>` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from './layout-store';

describe('layout-store', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarVisible: true, panelVisible: false });
  });

  it('defaults to sidebar visible and panel hidden', () => {
    const s = useLayoutStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.panelVisible).toBe(false);
  });

  it('togglePanel flips the targeted panel only', () => {
    useLayoutStore.getState().togglePanel('panel');
    expect(useLayoutStore.getState().panelVisible).toBe(true);
    expect(useLayoutStore.getState().sidebarVisible).toBe(true);
  });

  it('setPanelVisible sets an explicit value', () => {
    useLayoutStore.getState().setPanelVisible('sidebar', false);
    expect(useLayoutStore.getState().sidebarVisible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- layout-store`
Expected: FAIL — cannot find module `./layout-store`.

- [ ] **Step 3: Write the implementation**

```ts
import { create } from 'zustand';

export type PanelId = 'sidebar' | 'panel';

export interface LayoutState {
  sidebarVisible: boolean;
  panelVisible: boolean;
  togglePanel: (id: PanelId) => void;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
}

const key = (id: PanelId): keyof LayoutState =>
  id === 'sidebar' ? 'sidebarVisible' : 'panelVisible';

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarVisible: true,
  panelVisible: false,
  togglePanel: (id) => set((s) => ({ [key(id)]: !s[key(id)] }) as Partial<LayoutState>),
  setPanelVisible: (id, visible) => set({ [key(id)]: visible } as Partial<LayoutState>),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- layout-store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/layout-store.ts src/renderer/src/stores/layout-store.test.ts
git commit -m "feat: add zustand layout store with panel visibility"
```

---

### Task 3: Typed IPC contract and `ping` round-trip

**Files:**
- Create: `src/shared/ipc-contract.ts`
- Modify: `src/main/index.ts` (register the `ping` handler)
- Modify: `src/preload/index.ts` (expose typed `forge` API)
- Create: `src/preload/api.ts`
- Create: `src/renderer/src/env.d.ts`
- Test: `src/shared/ipc-contract.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `const IpcChannels = { ping: 'forge:ping' } as const`
  - `interface ForgeApi { ping: (msg: string) => Promise<string> }`
  - global `window.forge: ForgeApi` — consumed by Task 4.

- [ ] **Step 1: Write the failing test for the contract**

```ts
import { describe, expect, it } from 'vitest';
import { IpcChannels, pongOf } from './ipc-contract';

describe('ipc-contract', () => {
  it('exposes a stable ping channel name', () => {
    expect(IpcChannels.ping).toBe('forge:ping');
  });

  it('pongOf echoes the message with a pong prefix', () => {
    expect(pongOf('hello')).toBe('pong: hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ipc-contract`
Expected: FAIL — cannot find module `./ipc-contract`.

- [ ] **Step 3: Create `src/shared/ipc-contract.ts`**

```ts
export const IpcChannels = {
  ping: 'forge:ping',
} as const;

export interface ForgeApi {
  ping: (msg: string) => Promise<string>;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ipc-contract`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the handler in `src/main/index.ts`**

Add `ipcMain` to the electron import and register the handler inside `app.whenReady().then(...)` before `createWindow()`:

```ts
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannels, pongOf } from '@shared/ipc-contract';
```

Inside `app.whenReady().then(() => { ... })`, add as the first line:

```ts
  ipcMain.handle(IpcChannels.ping, (_event, msg: string) => pongOf(msg));
```

- [ ] **Step 6: Create `src/preload/api.ts`**

```ts
import { ipcRenderer } from 'electron';
import { IpcChannels, type ForgeApi } from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
};
```

- [ ] **Step 7: Replace `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron';
import { api } from './api';

contextBridge.exposeInMainWorld('forge', api);
```

- [ ] **Step 8: Create `src/renderer/src/env.d.ts` (type the global)**

```ts
import type { ForgeApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    forge: ForgeApi;
  }
}

export {};
```

- [ ] **Step 9: Verify type-check passes across main, preload, renderer**

Run: `npm run type-check`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add typed IPC contract with ping round-trip"
```

---

### Task 4: App shell with Allotment regions wired to the layout store

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/AppShell.tsx`
- Create: `src/renderer/src/components/AppShell.test.tsx`
- Create: `src/renderer/src/styles/global.css`
- Modify: `src/renderer/src/main.tsx` (import global css + allotment css)

**Interfaces:**
- Consumes: `useLayoutStore` (Task 2), `window.forge.ping` (Task 3).
- Produces: `AppShell` React component — the root layout every later phase renders panels into.

- [ ] **Step 1: Write the failing component test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the sidebar, editor, and statusbar regions', () => {
    render(<AppShell />);
    expect(screen.getByTestId('sidebar-region')).toBeDefined();
    expect(screen.getByTestId('editor-region')).toBeDefined();
    expect(screen.getByTestId('statusbar-region')).toBeDefined();
  });
});
```

- [ ] **Step 2: Add Testing Library dev deps**

Run: `npm install -D @testing-library/react@^16.1.0 @testing-library/dom@^10.4.0`
Expected: installs cleanly.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- AppShell`
Expected: FAIL — cannot find module `./AppShell`.

- [ ] **Step 4: Create `src/renderer/src/styles/global.css`**

```css
:root {
  --forge-bg: #1e1e2e;
  --forge-fg: #cdd6f4;
  --forge-border: #313244;
}

html, body, #root {
  margin: 0;
  height: 100%;
  background: var(--forge-bg);
  color: var(--forge-fg);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.region {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--forge-border);
  box-sizing: border-box;
}

.statusbar {
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 12px;
  border-top: 1px solid var(--forge-border);
}
```

- [ ] **Step 5: Create `src/renderer/src/components/AppShell.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';

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
                Explorer
              </div>
            </Allotment.Pane>
          )}
          <Allotment.Pane>
            <div className="region" data-testid="editor-region">
              Editor
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

- [ ] **Step 6: Update `src/renderer/src/App.tsx`**

```tsx
import { AppShell } from './components/AppShell';

export function App(): React.JSX.Element {
  return <AppShell />;
}
```

- [ ] **Step 7: Update `src/renderer/src/main.tsx` to import styles**

Add these two imports at the top (after the React imports):

```tsx
import 'allotment/dist/style.css';
import './styles/global.css';
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- AppShell`
Expected: PASS (1 test). Note: the test runs in jsdom where `window.forge` is undefined; guard is not needed because the effect runs after render and the assertions don't await it, but if the test errors on `window.forge`, add to the test file top: `beforeAll(() => { (window as unknown as { forge: { ping: (m: string) => Promise<string> } }).forge = { ping: async (m) => 'pong: ' + m }; });`

- [ ] **Step 9: Verify the full app launches with panels**

Run: `npm run dev` (close after confirming)
Expected: window shows a resizable Explorer pane beside an Editor pane, with a statusbar reading "Forge — pong: ready". The divider between panes drags.

- [ ] **Step 10: Run the whole suite + type-check**

Run: `npm run test && npm run type-check`
Expected: all tests pass, type-check exits 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: app shell with resizable panels and ipc-backed statusbar"
```

---

## Self-Review

**Spec coverage (Phase 0 scope):** electron-vite + React/TS strict scaffold (Task 1) ✓; secure main/preload/renderer wiring with contextIsolation/sandbox (Tasks 1, 3) ✓; typed IPC contract (Task 3) ✓; app shell with empty panels (Tasks 2, 4) ✓. Later-phase items (Monaco, file tree, terminal, git, command registry) are intentionally out of Phase 0.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `ForgeApi.ping` signature identical in `ipc-contract.ts`, `preload/api.ts`, `env.d.ts`, and the `AppShell` call site. `PanelId`/`LayoutState` defined once in Task 2 and consumed in Task 4. `IpcChannels.ping` referenced consistently in contract, main handler, and preload api.

**Deliverable:** a launching, type-safe, securely-wired Electron app with resizable empty panels and a working IPC round-trip — the foundation for Phase 1 (editing core).
