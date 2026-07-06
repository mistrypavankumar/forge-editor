# Generate Skeleton

Generate a loading-skeleton component that matches the layout of an opened React/Next.js component,
so switching from skeleton → real component doesn't shift the page.

Command id: `forge.generateSkeleton` · Title: **Generate Skeleton** · Category: Editor

## Status

- **Step 1 (Architecture inspection)** — done.
- **Step 2 (MVP Static Analysis mode)** — done. The default, offline path.
- **Step 5 (Improve with AI)** — done. A model-backed mode for composed, props-driven pages that
  static analysis collapses (stat cards, data tables, custom components). See [AI mode](#ai-mode).
- Steps 3–4/6 (richer AST cases, Visual Match mode, more polish) — not yet.

## How to use

1. Open a `.tsx` / `.jsx` component file.
2. Trigger **Generate Skeleton** from any of:
   - the editor tab-strip toolbar button (the "template" icon, shown only for React files),
   - the command palette (`Cmd/Ctrl+Shift+P` → "Generate Skeleton"),
   - the editor right-click menu.
3. If the file has one component, the preview opens directly. Multiple components → a picker first.
4. In the preview you can **Copy Code**, **Create New File** (a sibling `<Name>Skeleton.tsx`), or
   **Insert Below Component** (appends to the current file and merges the MUI `Skeleton` import).
5. If the static skeleton looks too sparse (common when the page is built from custom components),
   click **Improve with AI** to regenerate it with the configured model — see [AI mode](#ai-mode).

Nothing is written to disk or the buffer until you pick an apply action — the flow is preview-first.

## AI mode

Static analysis only understands JSX written *inline* in the file it runs on. Pages composed from
custom, props-driven components (`<StatCard title value icon/>`, `<DataTable columns data/>`) defeat
it: an unknown self-closing component becomes a single generic block and content passed as props is
dropped, so a rich dashboard collapses into a few empty boxes.

**Improve with AI** (the `✨` button in the preview footer) hands the target component to the
configured AI provider and asks it to *infer* the nested structure — a stat card becomes a bordered
box with a label line, a big number block, and a circular icon; a data table becomes a header row
plus repeated placeholder rows × columns — emitting a skeleton in the detected dialect (MUI /
Tailwind / plain). It's still preview-first: nothing is applied until you choose Copy / Create /
Insert, and you can flip back to the static result by regenerating.

Flow: `SkeletonPreview` → `skeleton/actions.ts#improveWithAi` → IPC `skeletonGenerateAi` →
`skeleton/ai-generator.ts#generateSkeletonWithAi`, which reuses the static detector for component
discovery + UI-library classification, then calls `streamAiChat` (same provider plumbing as the
assistant/agent) with a skeleton-specific system prompt and parses the model's JSON reply
(`{code, importsToAdd, fileImports, notes}`). The provider is whatever `resolveAi` returns
(defaults to the local `claude` CLI — no API key needed).

Because it's model-backed it is **non-deterministic** and network-bound; results carry a
"review before applying" warning and the preview shows Mode: **AI**, Layout match: **Inferred**.

## Architecture

Parsing uses the TypeScript compiler API, which in this app is only available in the **main
process** (the renderer bundle has no `typescript`). So generation runs in main and is exposed over
IPC, mirroring `codemapBuild`.

```
Renderer                                   Main process
────────                                   ────────────
commands/skeleton-commands.ts   ── IPC ──▶ ipc: skeletonDetect / skeletonGenerate  (src/main/index.ts)
skeleton/actions.ts  ─┐                        │  skeletonGenerateAi  ── resolveAi ──┐
skeleton/transform.ts │  (apply/merge)         ▼                                     ▼
stores/skeleton-store.ts                   skeleton/skeleton-service.ts       ai/chat.ts (streamAiChat)
components/SkeletonPreview.tsx                  ├─ detect.ts   (findComponents, detectUiLibrary)
                                                ├─ generator.ts   (JSX AST → skeleton IR → TSX)
                                                └─ ai-generator.ts (component → model → skeleton TSX)
```

Shared types live in `src/shared/skeleton.ts` (`GenerateSkeletonInput` / `GenerateSkeletonResult` /
`SkeletonComponentInfo`) and are referenced by `ipc-contract.ts`.

### Generation pipeline (static mode)

1. `findComponents` locates exported PascalCase functions/arrows + the default export that render JSX.
2. `detectUiLibrary` classifies the file: `mui` (any `@mui/*` import) → `tailwind` (Tailwind-looking
   `className`s) → `plain-react` (JSX only) → `unknown`.
3. The target component's returned JSX is walked into a small skeleton IR: **layout containers are
   preserved verbatim** (with only layout/style attributes kept), **content elements are replaced**
   with skeleton placeholders, `.map(...)` becomes a fixed-count repeat, and event handlers /
   business logic / data bindings are dropped.
4. The IR is emitted as TSX in the detected dialect:
   - **MUI** → `<Skeleton variant="text|rounded|rectangular|circular" …/>`
   - **Tailwind** → `animate-pulse` `bg-gray-200` blocks, preserving original size/margin classes
   - **Plain React** → inline-styled `<div>` blocks

### Element mapping (summary)

| Real element                              | Skeleton (MUI)                    | Skeleton (Tailwind)          |
| ----------------------------------------- | --------------------------------- | ---------------------------- |
| `Typography` / heading / `{value}` / text | `variant="text"`                  | `h-4/h-6 w-…` pulse block    |
| `Button`                                  | `variant="rounded"` 100×36        | `h-9 w-24` pulse block       |
| `Avatar` / `IconButton`                   | `variant="circular"`              | `h-10 w-10 rounded-full`     |
| `img` / `CardMedia`                       | `variant="rectangular"`           | preserves `h-…`/`rounded-…`  |
| `Chip`                                    | `variant="rounded"` small         | `h-6 w-16`                   |
| `TextField` / inputs                      | `variant="rounded"` full-width    | `h-10 w-full`                |
| `<p>`                                     | two text lines (100% + 60%)       | two lines (`w-full`+`w-4/5`) |
| Card/Stack/Grid/Table/List/Box/div…       | **preserved** and recursed into   | preserved                    |

## Safety

- Preview-first: no file changes without an explicit apply action.
- **Create New File** refuses to overwrite an existing file.
- **Insert Below** appends via a single undoable Monaco edit (leaves the file dirty for review).
- Generated skeletons contain no data, API calls, handlers, or provider/context requirements.

## Testing

Unit tests (Vitest):

```
npx vitest run src/main/skeleton/generator.test.ts src/renderer/src/skeleton/transform.test.ts
```

They cover the spec's manual cases: MUI card, MUI table (repeated rows), Tailwind card,
multi-component picker, non-React rejection, props component, component detection, UI-library
detection, and import merging.

Manual smoke test: open a `.tsx` component, run Generate Skeleton, and try each apply action.

## Known limitations (static mode)

- Sizes are heuristic estimates; there is no rendered-DOM measurement yet, so `layoutMatchScore` is
  reported as "Estimated". Visual Match mode (Step 4) will address this.
- Class components (`render()`) are not detected; only function/arrow components.
- Spread props (`{...props}`) on an element are dropped (with a warning) since their contents are
  unknown.
- `CardHeader` used via props (`title=`, `avatar=`) loses that content because only layout attrs are
  preserved — the container is kept but rendered empty.
- Tailwind class ordering in output is not canonical (irrelevant to rendering).
- "Improve with AI" and "Re-render with custom props" are intentionally not wired yet (Steps 4–5).

## Next steps

- **Step 3**: richer AST handling (class components, more container/leaf mappings, prop-type sample
  generation, `.skeleton.tsx` naming convention detection).
- **Step 4**: Visual Match mode — render the component (hidden preview/Storybook/route), measure the
  DOM, and generate dimension-accurate skeletons with a real layout-match score. Could feed measured
  dimensions into the AI prompt for a hybrid "measured + inferred" mode.
