# Forge — Modern Customizable Code Editor (Design Spec)

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Working name:** `forge` (rename freely)

## 1. Purpose

A desktop, IDE-lite **code editor** with a modern UI, built for developers, whose
defining trait is **customization**: themes, keybindings, layout, and (in a later
phase) a plugin system. The MVP ships a polished editing core; the architecture is
deliberately shaped so plugins slot in without a refactor.

### Non-goals (MVP)

- Full language-server (LSP) / cross-project IntelliSense beyond what Monaco gives out of the box.
- A built/marketplace plugin system (architected-for, not built in MVP).
- Remote/SSH or web-hosted editing.
- Windows/Linux polish guarantees — cross-platform via Electron is expected to work, but macOS is the primary target.

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Editor category | Code editor (IDE-lite) | User intent |
| Desktop platform | Electron + React 19 + TypeScript 5 (strict) | User's existing stack; fast to build; cross-platform |
| Editing engine | Monaco | Rich out-of-box IDE features; best fit for IDE-lite |
| Architectural spine | **Command registry** (Approach A) | Every action is a command; palette/menus/keybindings dispatch commands; plugins later plug into the same registry |
| MVP customization | Themes, keybindings, layout/panels | Plugins designed-for but deferred |
| MVP features | File tree + tabs, find/replace + command palette, integrated terminal, git basics | User selection |
| Build tooling | `electron-vite` | Fast HMR for main + renderer |
| Renderer state | Zustand | Lightweight, ergonomic stores |
| Layout (MVP) | `Allotment` split panes + panel-toggle store | Simple, resizable; swappable for full docking later |
| Terminal | `xterm.js` (renderer) ↔ `node-pty` (main) | Standard, reliable |
| Git | `simple-git` (main) over system git | Changed files, diff, stage, commit |

## 3. Process Architecture (Electron)

```
┌─────────────────────────────────────────────────────────┐
│ Main process (Node)                                       │
│  • window/app lifecycle                                   │
│  • fs-service        (read/write/watch files & folders)   │
│  • git-service       (simple-git → system git)            │
│  • pty-service       (node-pty terminal sessions)         │
│  • settings/persistence (themes, keybindings, layout)     │
└───────────────┬───────────────────────────────────────────┘
                │ typed IPC (request/response + events)
┌───────────────┴───────────────────────────────────────────┐
│ Preload (contextBridge)                                    │
│  • exposes a narrow, typed `window.forge` API              │
│  • NO nodeIntegration in renderer; contextIsolation: true  │
└───────────────┬───────────────────────────────────────────┘
                │
┌───────────────┴───────────────────────────────────────────┐
│ Renderer (React 19 + TS strict)                            │
│  • command-registry (spine)                                │
│  • keybinding-service, theme-service                       │
│  • layout-store, editor, file-explorer, terminal, git UI   │
│  • command-palette, settings UI                            │
└────────────────────────────────────────────────────────────┘
```

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox` where
feasible. The renderer never touches Node APIs directly — only the curated preload
bridge. All IPC channel names and payloads are typed in a shared `ipc` contract module.

## 4. The Command Registry Spine (core of Approach A)

The single most important design element. Everything the user can *do* is a **command**:

```ts
interface Command {
  id: string;                  // e.g. "file.save", "terminal.toggle", "git.commit"
  title: string;               // human label (palette/menu)
  category?: string;           // grouping in palette
  run: (ctx: CommandContext) => void | Promise<void>;
  isEnabled?: (ctx: CommandContext) => boolean;
}
```

- **Command palette** lists/filters registered commands and invokes `run`.
- **Keybindings** map keystrokes → command IDs (data, not code).
- **Menus** (app menu / context menus) are declarative lists of command IDs.
- **Plugins (later)** register commands/themes/views into this same registry —
  no special-casing, which is exactly why the spine is built on day one.

**Contribution points** (the extensibility vocabulary, used by core now and plugins later):
`commands`, `keybindings`, `themes`, `views` (sidebar/panel slots). MVP core registers
into these; the plugin loader (Phase 2) reads the same contribution shapes from manifests.

## 5. Module Boundaries

Each module has one purpose, a defined interface, and is testable in isolation.

| Module | Process | Responsibility | Depends on |
|---|---|---|---|
| `ipc-contract` | shared | Typed channel names + payload types | — |
| `fs-service` | main | File/folder read, write, rename, delete, watch | ipc-contract |
| `git-service` | main | status, diff, stage/unstage, commit | ipc-contract, simple-git |
| `pty-service` | main | spawn/kill PTY, stream data | ipc-contract, node-pty |
| `settings-service` | main | persist + load themes/keybindings/layout JSON | fs |
| `command-registry` | renderer | register/lookup/run commands | — |
| `keybinding-service` | renderer | keystroke → command; user overrides | command-registry, settings |
| `theme-service` | renderer | load theme JSON → CSS vars + Monaco theme | settings |
| `layout-store` | renderer | panel sizes/visibility; persist | settings |
| `editor` | renderer | Monaco wrapper, tab + text-model manager | command-registry, fs |
| `file-explorer` | renderer | workspace folder tree, open/create/rename | fs, command-registry |
| `terminal` | renderer | xterm UI bound to a pty session | pty-service |
| `git-panel` | renderer | changed files, diff view, stage/commit UI | git-service |
| `command-palette` | renderer | fuzzy command + file quick-open | command-registry, fs |
| `settings-ui` | renderer | edit themes/keybindings/layout | settings, theme, keybinding |

## 6. Data Flow Examples

**Save file:** user hits keystroke → `keybinding-service` resolves `file.save` →
`command-registry.run` → `editor` reads active model text → preload `fs.write` → main
writes to disk → success event → editor clears dirty flag.

**Toggle terminal:** keystroke → `terminal.toggle` command → `layout-store` flips panel
visibility (persisted). First open lazily requests a PTY from `pty-service`.

**Switch theme:** palette → `theme.select` command → `theme-service` loads theme JSON →
sets CSS custom properties on `:root` + applies the matching Monaco theme → persists choice.

**Git commit:** `git-panel` stages files via `git-service.stage` → user enters message →
`git.commit` command → main runs commit → status refreshes via event.

## 7. Customization Model

- **Themes:** JSON files (UI color tokens + Monaco token colors). Built-in `dark`/`light`;
  user themes loaded from `~/.forge/themes/`. Applied as CSS variables — no hardcoded colors anywhere in components.
- **Keybindings:** `~/.forge/keybindings.json` overrides defaults; merged at startup; conflicts surfaced in settings UI.
- **Layout:** panel visibility + sizes persisted in settings; restored on launch.
- **Plugins (Phase 2):** manifest declaring contribution points; loaded into the same registry.

## 8. Error Handling

- IPC calls return typed `Result`-style responses (`{ ok: true, data } | { ok: false, error }`); no thrown errors cross the process boundary.
- FS/git failures surface as non-blocking toasts; the editor never loses unsaved buffer state on a failed write.
- PTY crash → terminal panel shows an inline "session ended" state with a restart action.
- Malformed user theme/keybinding JSON → fall back to defaults + a visible warning, never a blank/broken UI.

## 9. Testing Strategy

- **Unit (Vitest):** command-registry, keybinding resolution + override merge, theme JSON → CSS-var mapping, layout-store reducers, IPC contract serialization.
- **Service tests:** fs-service / git-service against a temp dir; pty-service smoke test.
- **Component (React Testing Library):** command palette filtering, file tree interactions, tab manager dirty-state.
- **Smoke/e2e (later):** launch Electron, open a folder, edit + save, run a git status — Playwright-Electron.
- TDD for the pure modules (registry, keybindings, theme mapping, layout) where logic is non-trivial.

## 10. Phasing

- **Phase 0 — Scaffold:** electron-vite + React/TS strict, secure main/preload/renderer wiring, typed IPC contract, app shell with empty panels.
- **Phase 1 — Editing core:** Monaco wrapper, open folder, file tree, tabs, save, dirty state, find/replace.
- **Phase 2 — Spine + customization:** command registry, command palette + quick-open, keybinding service + overrides, theme service + built-in themes, layout persistence.
- **Phase 3 — Integrated tooling:** terminal (xterm + node-pty), git panel (status/diff/stage/commit).
- **Phase 4 — Settings UI + polish:** settings screens for themes/keybindings/layout, error states, packaging.
- **Phase 5 (post-MVP) — Plugin system:** manifest loader reading the existing contribution points.

## 11. Open Questions (resolve during planning)

- Final product name (currently `forge`).
- Settings/config home: `~/.forge/` vs Electron `app.getPath('userData')` — leaning `~/.forge/` for user-discoverable JSON.
- Single-window vs multi-window in MVP (assume single-window).
