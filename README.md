# Forge

A desktop, IDE-lite **code editor** with a modern UI, built for developers whose
defining trait is **customization** — themes, keybindings, layout, and (later) a
plugin system. macOS is the primary target; cross-platform via Electron is
expected to work.

## Features

- **Editing core** — [Monaco](https://microsoft.github.io/monaco-editor/)-powered
  editor with tabs, split editor groups, breadcrumbs, auto-close tags, and a
  TypeScript-aware language service for go-to-definition and diagnostics.
- **Command spine** — every action is a command; the command palette, menus, and
  keybindings all dispatch through one registry (plugins slot into the same spine).
- **File explorer** — tree view, file operations, fuzzy quick-open, and search
  across the workspace.
- **Integrated terminal** — real shell sessions via
  [xterm.js](https://xtermjs.org/) ↔ [node-pty](https://github.com/microsoft/node-pty),
  with split panes and a Tasks bar (Dev / Test / Build / Lint / …).
- **Git** — branch picker, changed-files view, diff/peek, staging, and commit,
  plus GitHub account integration via the `gh` CLI.
- **Diagnostics & formatting** — a Problems panel, auto-diagnostics, and
  pluggable formatters with auto-format-on-save.
- **AWS** — connection picker and credentials editor that inject `AWS_PROFILE`
  into terminals and tasks.
- **Customization** — themes (with a dedicated editor color scheme), editable
  keybindings, and a toggleable panel layout, all persisted across sessions.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron + React 19 + TypeScript 5 (strict) |
| Build tooling | [electron-vite](https://electron-vite.org/) (HMR for main + renderer) |
| Editing engine | Monaco |
| Renderer state | [Zustand](https://zustand-demo.pmnd.rs/) |
| Layout | [Allotment](https://github.com/johnwalley/allotment) split panes |
| Terminal | xterm.js (renderer) ↔ node-pty (main) |
| Styling | Tailwind CSS v4 |
| Tests | Vitest + Testing Library |

## Getting started

Requires Node.js and [pnpm](https://pnpm.io/).

```bash
pnpm install      # also runs a postinstall fix for node-pty's spawn-helper
pnpm dev          # launch the app with hot reload
```

> **macOS note:** `pnpm install` drops the execute bit on node-pty's bundled
> `spawn-helper`, which leaves the integrated terminal blank
> (`posix_spawnp failed.`). The `postinstall` script
> (`scripts/fix-node-pty.mjs`) re-applies it automatically; if you ever bypass
> install scripts, run `node scripts/fix-node-pty.mjs` manually.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run the app in development with hot reload |
| `pnpm build` | Type-check, then build main, preload, and renderer |
| `pnpm preview` | Preview a production build |
| `pnpm type-check` | Run `tsc --noEmit` over the app and node configs |
| `pnpm test` | Run the test suite once (`vitest run`) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint with ESLint (flat config) |

## Use as your editor for dev tools (`REACT_EDITOR`)

Forge is GUI-only — it has no `code`-style `file:line:column` CLI — so tools that
shell out to an editor (Next.js's `launch-editor` / `REACT_EDITOR`, react-dev-utils,
error overlays) need a small wrapper that opens files via the macOS app association.

Create `~/.local/bin/forge-open`:

```sh
#!/bin/sh
# Open files in Forge for tools that use REACT_EDITOR. Strips any :line:column
# suffix (Forge can't jump to a position via argv) and uses the macOS association.
files=""
for arg in "$@"; do files="$files ${arg%%:*}"; done
exec open -a Forge $files
```

```bash
chmod +x ~/.local/bin/forge-open
```

Then point your project's `.env.local` (or shell) at it:

```bash
# Forge is GUI-only (no file:line:column CLI) — route opens through a wrapper that uses `open -a Forge`.
REACT_EDITOR=/Users/pavankumarmistry/.local/bin/forge-open
```

Restart the dev server afterward — `.env.local` is read only at startup.

## Project structure

```
src/
  main/        Electron main process — IPC, terminal, git, language service,
               search, AWS, diagnostics, formatting, fs
  preload/     Sandboxed bridge exposing a typed `window.forge` API
  renderer/    React UI — components, command registry, editor wiring,
               Zustand stores, themes, keybindings, settings
  shared/      IPC contract and types shared across processes
docs/          Design spec and phased implementation plans
```

## Architecture

The renderer never touches Node directly. The main process owns all
privileged work (filesystem, git, PTYs, the TypeScript language service) and
exposes it over a typed IPC contract (`src/shared/ipc-contract.ts`); the preload
script surfaces it to the renderer as `window.forge`. The renderer is a React +
Zustand app where every user action flows through the command registry.

## License

MIT
