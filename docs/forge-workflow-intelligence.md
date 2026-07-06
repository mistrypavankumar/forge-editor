# Forge Workflow Intelligence

This document describes the "workflow intelligence" features layered on top of the base editor:
AI Agent Workspace Mode, Codebase Map, Impact Analysis, Error-to-Fix, Task Sessions, GraphQL Super
Mode, the Database Client, and the PR / Code Review Center.

It is written incrementally, one phase per section, as each ships.

---

## Design principles

These hold across every phase:

- **Reuse the existing spine.** The IPC contract (`src/shared/ipc-contract.ts` → `src/preload/api.ts`
  → `src/main/index.ts`), the command registry, the layout/editor/workspace stores, the terminal,
  git service, file watcher, and settings are the substrate. New features extend them; they do not
  fork them.
- **Main/renderer separation.** All filesystem, process, credential, and OS operations happen in the
  main process behind typed IPC returning `Result<T>`. The renderer never spawns processes.
- **AI degrades gracefully.** Every feature is usable with no AI provider configured. AI is additive;
  its absence disables an action, never a whole panel.
- **Nothing destructive without review.** Edits are drafted and shown as diffs before they touch disk.
- **Off the render thread.** Indexing/analysis run in the main process or are chunked; the React tree
  only renders results.

---

## Phase 1 — AI Agent Workspace Mode

A task-oriented agent that plans, proposes multi-file edits behind diffs, applies changes on your
approval, and runs project checks — all inside the right dock next to the existing Chat assistant.

### Data flow

```
AgentPanel (UI)
  └─ orchestrator.ts        scripted controller (plan → edit → review → checks)
       ├─ tools.ts          internal tool interface over window.forge + editor store
       ├─ agent-store.ts    session state, timeline, draft patches (persisted to localStorage)
       └─ window.forge.agentComplete / agentRunCommand   (IPC)
            └─ main/ai/agent-service.ts    one-shot brain via streamAiChat (provider-agnostic)
            └─ main/agent/command-exec.ts  captured-output command runner (login shell + AWS env)
```

The model **never** edits files. The orchestrator gathers context, asks the model for structured
JSON (a plan, then patches), and the app performs all side effects. This preserves the safety
property of the existing assistant (which also runs with tools off).

### The lifecycle (`AgentStatus`)

`idle → planning → plan-ready → editing → review → checking → done`
with `error` / `cancelled` as terminal states for the current attempt.

1. **planning** — `startTask` indexes the workspace (`listFiles`), reads open editors, and asks the
   brain (`phase: 'plan'`) for `{summary, steps, filesToEdit, commands}`.
2. **plan-ready** — the plan is shown. Nothing has changed yet. **Approve Plan** advances.
3. **editing** — `approvePlan` reads the target files and asks the brain (`phase: 'edit'`) for
   `{patches: [{path, content, description}]}` — each `content` is a full file rewrite.
4. **review** — patches become `FilePatch` drafts (before/after computed against disk, no-ops
   dropped). Each is viewable as a read-only diff tab and can be **Applied** or **Rejected**
   individually, or **Apply All**.
5. **checking** — **Run Checks** runs the plan's suggested commands and/or the configured
   Test/Build/Lint tasks via `agentRunCommand`, captures output, and extracts error lines.

Every tool call and phase transition is appended to the session **timeline**.

### The internal tool interface (`src/renderer/src/agent/tools.ts`)

| Tool             | Backed by                                   |
| ---------------- | ------------------------------------------- |
| `listFiles`      | `window.forge.listFiles`                    |
| `readFile`       | `window.forge.readFile`                     |
| `searchFiles`    | `window.forge.search`                       |
| `getOpenEditors` | `editor-store` tabs                         |
| `getDiagnostics` | `window.forge.runDiagnostics`               |
| `writeFileDraft` | in-memory `FilePatch` in `agent-store`      |
| `showDiff`       | synthetic read-only diff tab in the editor  |
| `applyPatch`     | `window.forge.writeFile` (+ editor refresh) |
| `runCommand`     | `window.forge.agentRunCommand`              |

The orchestrator wraps each call with timeline tracking (`running → ok/error`) rather than baking
tracking into the tools, keeping the tools plain and easy to reason about.

### New IPC (added to the four-point contract)

- `agentComplete(args) → Result<string>` — one-shot brain completion for a phase; cancel with
  `agentCancel(id)`. System prompts + output contracts live in `main/ai/agent-service.ts`.
- `agentRunCommand(args) → Result<AgentCommandResult>` — spawn a command in the workspace, capture
  stdout/stderr/exit/duration with a timeout; cancel with `agentCancelCommand(id)`. Runs through a
  login shell (full PATH) with the active AWS profile injected — the same environment as the
  integrated terminals. This is also the foundation for the Phase 4 error-to-fix workflow.

### Feature flag & persistence

- Flag: `agent-store.enabled` (localStorage `forge.agent.enabled.v1`, default on). Toggle via the
  command **AI Agent: Enable/Disable Agent Mode**. When off, the panel shows an enable prompt.
- The current session is persisted best-effort to `forge.agent.session.v1` so a task survives a
  reload; an interrupted in-flight phase is settled to `review`/`idle` on load (an in-flight model
  request cannot resume across a reload).

### Commands

- `ai.openAgent` — **AI Agent: Open Agent Workspace** (reveals the dock in Agent mode)
- `ai.openChat` — **AI Assistant: Open Chat**
- `ai.toggleAgentEnabled` — **AI Agent: Enable/Disable Agent Mode**

### Key files

```
src/shared/ipc-contract.ts                 agent channels, DTOs, ForgeApi methods
src/preload/api.ts                         preload bridge for the new channels
src/main/ai/agent-service.ts               brain: plan/edit system prompts + streamAiChat
src/main/agent/command-exec.ts             captured-output command runner
src/main/index.ts                          IPC handler registration
src/renderer/src/agent/types.ts            session / plan / patch / timeline types
src/renderer/src/agent/parse.ts            defensive JSON + error-line parsing (unit-tested)
src/renderer/src/agent/tools.ts            internal tool interface
src/renderer/src/agent/orchestrator.ts     the scripted controller
src/renderer/src/stores/agent-store.ts     session state + persistence
src/renderer/src/components/AgentPanel.tsx  the UI
src/renderer/src/components/RightPanel.tsx  Chat | Agent switch
src/renderer/src/components/ui/ErrorBoundary.tsx
src/renderer/src/commands/agent-commands.ts
```

### Limitations (MVP) / next steps

- The plan phase grounds on the file tree + open editors (not a full semantic search loop). Once the
  Phase 2 Codebase Map exists, the orchestrator should pull relevant files by dependency, not just
  what's open.
- Edits are whole-file rewrites (robust to parse, but larger diffs). A future pass can request
  minimal hunks for big files.
- Persistence stores the session in localStorage; Phase 5 (Task Sessions) will move durable,
  branch-aware sessions under the user data dir / `.forge/`.
- Checks are one-shot captured runs; streaming a long-running check into the panel is a follow-up.

---

## Phase 2 — Codebase Map / Dependency Graph

A static dependency graph of the workspace, plus a per-file insight card. It answers "what depends
on this / what does this depend on / is it risky to change" without an LSP server.

### Where the work happens

All analysis runs in the **main process** (off the React render thread) using the TypeScript parser
(`ts.createSourceFile` — syntactic only, no Program/type-checker, so each file parses sub-millisecond).

```
CodebaseMapView (editor tab)   FileInsightPanel (navigator "Insight" tab)
        └──────────────┬──────────────┘
             codemap/store.ts (renderer cache)  ── deriveInsight() (pure)
                     │ window.forge.codemapBuild(root, force)   (IPC)
        ┌────────────┴───────────────────────────────────┐
        main/codemap/codemap-service.ts   cache + incremental (by mtime) + assemble
          ├─ scan.ts       parseSource (imports/exports/components/hooks/gql), nextInfo, resolver
          ├─ graphql.ts    extractGqlOperations (regex, tolerant of interpolation)
          └─ graph.ts      findCycles (Tarjan), classifyRisk, isEntrypoint
```

### What it detects

- **Imports / exports** for `.ts/.tsx/.js/.jsx/.mjs/.cjs` (named, default, namespace, re-exports).
- **React components** (exported PascalCase in a JSX-capable file) and **hooks** (`use…`).
- **GraphQL** operations/fragments in `.graphql`/`.gql` files and `gql`/`graphql` tagged templates.
- **Next.js** App Router (`page`/`layout`/`route`/`loading`/`error`/…) and Pages Router files, with
  the derived route path (route groups `(…)` stripped, `[id]` kept).
- **Edges**: import specifiers resolved against the scanned file set with a cached tsconfig-alias
  resolver (relative + `paths` + `extends`); bare npm packages are recorded as external deps.
- **Circular dependencies** (strongly-connected components).
- **Unused files** — exported files nothing imports, excluding entrypoints (pages/routes/tests/
  config/index barrels/`.d.ts`), and **possibly-unused exports** (conservative: only when name-level
  usage is fully trackable — no namespace/star re-exports through the file).
- **Risk** per file: high (auth/routing/generated-GraphQL/shared-UI/public-API, or ≥8 dependents),
  medium (≥3 dependents), low (local-only).

### Surfaces

- **Codebase Map** — an editor tab (`kind: 'codemap'`, opened via **Open Codebase Map** or from the
  Insight panel). Tabs: **Graph** (focused ego-network SVG: `used by → file → depends on`, nodes
  clickable to select, double-click / center-click to open), **Files** (sortable table), **Cycles**,
  **Unused**. A search box + kind filters scope the file list. Clicking any node/row/link opens the
  file and reveals it in the tree; hovering a graph node shows path + dependency summary.
- **File Insight** — a new **Insight** tab in the Project Navigator that tracks the active editor
  file and shows: what it is, exports (unused ones struck through), depends-on, used-by, related
  GraphQL, related routes/pages, and a risk level with reasons. Every path is clickable.

### Performance & incrementality

- Parse results are cached per file by **mtime**; a rebuild after an edit re-parses only changed
  files. The assembled map is memoized per workspace and returned as-is unless `force` is passed.
- The renderer forces a debounced rebuild on `onFsChanged`; the first scan yields to the event loop
  every 200 files. Very large repos are capped at 4000 files (`truncated` flagged in the UI).

### Commands

- `workbench.openCodebaseMap` — **Open Codebase Map**
- `workbench.showFileInsight` — **Show File Insight (dependencies & risk)**

### Key files

```
src/shared/ipc-contract.ts                 CodeMap/CodeNode/GqlOperation DTOs + codemapBuild
src/main/codemap/scan.ts                   TS-AST parse, Next.js routes, kind, import resolver
src/main/codemap/graphql.ts                gql operation extraction
src/main/codemap/graph.ts                  cycles (Tarjan), risk, entrypoint heuristics
src/main/codemap/codemap-service.ts        cache + incremental + graph assembly
src/renderer/src/codemap/store.ts          renderer cache
src/renderer/src/codemap/insight.ts        deriveInsight() (pure)
src/renderer/src/components/CodebaseMapView.tsx    graph + list + cycles + unused
src/renderer/src/components/FileInsightPanel.tsx   the per-file card (navigator tab)
```
Tests: `graphql.test.ts`, `graph.test.ts`, `scan.test.ts`, `insight.test.ts`, plus an
`integration.smoke.test.ts` that analyzes this repo end-to-end.

### Limitations / next steps

- Static & syntactic: dynamic `require()`, computed imports, and runtime wiring aren't seen. Type-
  aware "find references" would need the Program (the existing Language Service) — a later upgrade.
- Component detection is heuristic (PascalCase + JSX), not render-tree analysis.
- Phase 3 (Impact Analysis) builds directly on this graph; Phase 6 (GraphQL Super Mode) extends the
  `gqlOps` index with schema validation and fragment graphs.
