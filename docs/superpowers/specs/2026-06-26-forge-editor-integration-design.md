# Forge editor integration — design

**Date:** 2026-06-26
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

Let external tools open files in Forge **without per-project `.env` configuration**.
A user installs Forge, accepts a one-time prompt, and from then on:

- Dev-server "open in editor" overlays (Next.js / CRA / Vite, via `REACT_EDITOR` /
  `LAUNCH_EDITOR`) open the clicked file in Forge.
- (Phase 2) Git and other `$EDITOR`/`$VISUAL` consumers open and **wait on** Forge.

This replaces the current workaround (a hand-written `~/.local/bin/forge-open`
wrapper plus a `REACT_EDITOR=…` line in every project's `.env.local`).

## Context

Forge is a GUI-only Electron editor (`com.pavankumar.forge`). It has **no
`code`-style `file:line:column` CLI** and registers **no URL scheme**, but it
already:

- accepts file paths via `process.argv` (`filePathsFromArgv` in `src/main/index.ts`),
- handles macOS `open-file` events (Finder "Open With", dock drops),
- holds a single-instance lock and forwards a second instance's argv to the
  running window via the `second-instance` event.

So Forge can already be *launched with a file and open it*. What is missing is the
**system wiring** (a `PATH` command + editor env vars) and, for git, a **blocking
`--wait` mode**.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Trigger model | First-run consent prompt **+** always-available palette commands (VS Code style). True "auto on install" is impossible for a drag-installed `.app`. |
| Env vars | All four: `REACT_EDITOR`, `LAUNCH_EDITOR`, `EDITOR`, `VISUAL`. |
| Install path | `~/.local/bin/forge` (user-writable, no sudo); ensure `~/.local/bin` is on `PATH`. |
| Delivery | **Phased (Approach C)**: Phase 1 = non-blocking dev-tool integration; Phase 2 = `--wait` socket for `$EDITOR`/git. |

## The critical correctness constraint

`REACT_EDITOR` / `LAUNCH_EDITOR` are **fire-and-forget** — the dev server spawns the
editor and never waits.

`EDITOR` / `VISUAL` are **blocking** — `git commit` runs `$EDITOR <tmpfile>` and reads
the result only after that process *exits*. If `forge` returns immediately, git
commits an empty/unedited message. Therefore `$EDITOR` requires a `--wait` mode that
stays alive until the specific file is closed in Forge (exactly why VS Code sets
`EDITOR="code --wait"`).

Consequences:

- Env values differ: `REACT_EDITOR=forge` / `LAUNCH_EDITOR=forge` (bare name —
  Next's `launch-editor` treats the env value as a literal binary name and does **not**
  shell-split it), but `EDITOR='forge --wait'` / `VISUAL='forge --wait'`.
- `open -aW Forge file` is **not** a solution: `-W` waits until Forge *fully quits*,
  not until the file closes. Per-file wait requires the CLI to talk to the running app.
- Because Phase 1 has no working `--wait`, Phase 1 **must not** set `EDITOR`/`VISUAL`
  (doing so would break git). They are added only in Phase 2.

## Components

### 1. `forge` CLI shim → `~/.local/bin/forge`

A small POSIX `sh` script that `exec`s the packaged Electron binary.

- **Phase 1:** pass-through — `exec "<ForgeApp>/Contents/MacOS/Forge" "$@"`. This
  reuses Forge's existing single-instance + `open-file` handling: a second invocation
  forwards the path to the running window and exits promptly (non-blocking).
- **Phase 2:** tag invocations with a CLI marker — `exec "<ForgeBin>" --cli "$@"` — so
  the main process runs CLI logic instead of a normal window launch.

The absolute binary path is resolved **at install time** and baked into the script.
If Forge.app is later moved, the user re-runs install.

### 2. Editor-integration installer (`src/main`, new module)

Pure, unit-testable functions: `install()`, `uninstall()`, `status()`.

- Writes the `forge` script and `chmod +x` it.
- Edits the user's shell profile inside an **idempotent marked block**:

  ```
  # >>> forge editor integration >>>
  …
  # <<< forge editor integration <<<
  ```

  Install rewrites the whole block; uninstall removes it; user content outside the
  markers is never touched.
- Detects the shell from `$SHELL`: zsh ⇒ `~/.zshrc`, bash ⇒ `~/.bashrc`. Creates the
  profile file if absent.
- Ensures `~/.local/bin` is on `PATH` (adds the export only if not already present).

**Phase 1 block:**
```sh
# >>> forge editor integration >>>
export PATH="$HOME/.local/bin:$PATH"
export REACT_EDITOR=forge
export LAUNCH_EDITOR=forge
# <<< forge editor integration <<<
```

**Phase 2 block** adds:
```sh
export EDITOR='forge --wait'
export VISUAL='forge --wait'
```

### 3. First-run prompt + palette commands

- A `editorIntegration.prompted` flag in the settings service gates a one-time dialog:
  *"Set Forge as your default editor? Installs the `forge` command and sets the editor
  environment variables so dev tools open files in Forge — no per-project config."*
  Buttons: **[Not now]** / **[Set up]**. "Not now" sets `prompted = true` and never
  re-asks.
- Always-available commands in the command registry:
  - *Shell Command: Install `forge` command & set as default editor*
  - *Shell Command: Uninstall `forge` command*
- Both invoke the installer over a new IPC channel added to `src/shared/ipc-contract.ts`.

### 4. (Phase 2) CLI socket server in main + `--wait`

- Main process listens on a unix domain socket; its path is written to the app-support
  directory so the CLI can find it.
- When the main process starts with `--cli`, it intercepts **before** opening a window:
  connects to the running instance's socket, sends the open request, and:
  - non-`--wait`: forwards the open and exits immediately;
  - `--wait`: blocks until the app signals that the file's editor was closed, then exits
    — unblocking git.
- Cold start (no running instance): launch the app, wait for the socket to come up, then
  proceed.
- Editor-close tracking: main maps an opened `--wait` path to its editor/tab and notifies
  the waiting CLI client on close.

## Out of scope

- **Line/column jump.** `launch-editor` only passes `:line:col` to editors it recognizes
  by binary name; `forge` receives just the path. A future `forge --goto file:line:col`
  flag (forwarded over the Phase 2 socket) could add this, but it is not part of this work.
- **GUI-launched dev servers.** Shell-profile env vars apply to terminal-launched
  processes (the normal `pnpm dev` workflow). Servers started from GUI launchers that
  don't inherit shell env are not covered; `launchctl setenv` / a LaunchAgent is a
  possible future addition.
- Windows / Linux PATH and profile handling (macOS-first, matching Forge's primary target).

## Error handling

- `~/.local/bin` not writable → reported in the prompt/command result; nothing else is
  changed.
- Shell profile missing → created.
- Re-install is idempotent (rewrites the marked block; no duplicates).
- Forge.app moved after install → baked binary path breaks; documented as "re-run install."

## Testing

- **Installer** (Vitest, over a temp `$HOME`): marked-block insert / update / remove
  idempotency; shell detection (zsh/bash); `PATH` already present; missing profile file;
  non-writable target.
- **CLI arg parsing** and (Phase 2) **socket protocol**: unit / integration tests with a
  fake socket server.
- **Manual:** Phase 1 — dev-tool "Open in editor" opens the file in Forge with no
  per-project `.env`. Phase 2 — `git commit` opens Forge and blocks until the file closes.

## Phasing summary

- **Phase 1 — dev-tool integration:** shim (pass-through), installer, shell-profile block
  with `REACT_EDITOR`/`LAUNCH_EDITOR` + `PATH`, first-run prompt, install/uninstall
  commands, installer tests. Delivers the original need and is independently verifiable.
- **Phase 2 — blocking `$EDITOR`:** `--cli` marker, socket server, `--wait`, editor-close
  tracking, cold-start handling, and the block upgrade adding `EDITOR`/`VISUAL`.
