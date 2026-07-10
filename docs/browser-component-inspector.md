# In-Editor Browser + Click-to-Open Component Inspector

An embedded browser panel that loads your running app inside Forge, plus an **Inspect Mode** that
maps any element you click back to its source file and opens it in Monaco. It is built for
Next.js App Router first, then React + Vite / plain React.

This document is written incrementally, one phase per section, as each ships. Phase 1 (this patch)
covers Steps 2–4 of the plan: the Browser panel, Inspect Mode with React-fiber mapping, and source
resolution with route/component fallbacks. Build-time metadata injection (Strategy 2) is documented
as a future phase.

---

## Design principles (reused spine)

- **Reuse the existing spine.** The Browser panel is a synthetic editor tab (`kind: 'browser'`),
  exactly like the API Explorer and Codebase Map — no new layout-store panel type. Source opening
  reuses `openFilePath(path).then(() => requestReveal({ path, line, col }))`, the same flow search
  results, problems, and go-to-definition use. The component/route index reuses the existing
  **Codebase Map** (`codemapBuild`), which already parses `.tsx/.jsx` and detects Next.js routes.
- **Main/renderer separation & security.** The guest page runs in an Electron `<webview>` with
  `nodeIntegration` off, in an isolated `persist:forge-browser` partition, with its own sandboxed
  preload. The only new main-process IPC is a TCP port probe and a preload-path lookup — no
  filesystem or credentials are exposed to the page.

---

## Architecture

```
Activity sidebar (Globe)  ──▶  openBrowser()  ──▶  editor tab kind:'browser'  ──▶  <BrowserView>
                                                                                        │
  Toolbar: back/fwd/refresh/URL/external/Inspect     Dev-server strip (port probe)      │
                                                                                        ▼
                                                                                  <webview>  (guest app)
                                                                                        │ preload
                        webview-preload.cjs  ◀── injects ──▶  main-world inspector script │
                        (isolated world)                     (reads React fiber, overlay, │
                                                              click-intercept)            │
   BrowserView ◀── ipc-message 'forge:inspect:selection' ── sendToHost ◀── window.postMessage
        │
        ▼  resolveAndOpen(selection)   (src/renderer/src/browser/resolver.ts)
   1. data-forge-* metadata  →  2. fiber _debugSource  →  3. component-name index  →  4. route file
        │
        ▼
   openFilePath(path) + requestReveal({ line, col })   →   Monaco jumps to the source
```

### Why `<webview>` (not `WebContentsView` / iframe)

A `<webview>` is a real DOM node, so the toolbar, inspector side-panel, and hover overlay layer
naturally within the React panel. A `WebContentsView` floats above the renderer and fights the panel
system; an iframe is blocked by most apps' frame/CORS headers and can't run a preload.

### Why a main-world inspector script

React attaches its fiber to DOM nodes as `__reactFiber$…` **expando properties**, which are only
visible from the page's *main world* — an isolated-world preload (like a Chrome content script)
cannot read them. So the sandboxed webview preload injects a self-contained `<script>` into the main
world and bridges it back with `window.postMessage` → `ipcRenderer.sendToHost`. Host → guest
(inspect on/off) goes `webview.send` → `ipcRenderer.on` → `window.postMessage`.

---

## Source resolution order

For a clicked element, `resolveAndOpen` tries the strongest signal first:

1. **`data-forge-*` metadata** (Strategy 2, future injector) — exact file + line.
2. **React fiber `_debugSource`** (dev builds with `@babel/plugin-transform-react-jsx-source`, which
   Next.js dev enables) — exact JSX file + line of the element.
3. **Component name → project index.** `matchComponents(name, nodes)` against the Codebase Map.
   One match → open it. Multiple → a picker in the inspector panel. Component positions come from the
   codemap's new `componentDetails` (name + 1-based line/column).
4. **URL → Next.js route file.** `matchRouteFile(urlPath, nodes)` maps `/a/b/c` to the best
   `page.tsx` (preferring page over layout over route), handling route groups `(...)` (already
   stripped by the codemap) and dynamic segments `[id]` / `[...slug]` / `[[...slug]]`.
5. **Nothing matched** → a helpful message in the inspector panel.

---

## Commands

| Command id | Title |
| --- | --- |
| `forge.browser.open` | Open Browser |
| `forge.browser.toggleInspectMode` | Toggle Browser Inspect Mode |
| `forge.browser.openSelectedElementSource` | Open Selected Element Source |
| `forge.browser.refresh` | Refresh Browser |
| `forge.browser.back` | Browser Back |
| `forge.browser.forward` | Browser Forward |

Available from the command palette and the activity sidebar (Globe icon). Toolbar buttons drive the
same actions directly.

### Inspector panel actions

When an element is selected, the inspector panel (right side) shows the component, resolved source
file, route, DOM, confidence, and parent-component chain, plus action buttons:

- **Open Source** — reopen the resolved file at its position.
- **Open Route File** — open the Next.js `page.tsx` for the current URL (always available while on a
  known route, even when the component resolves elsewhere).
- **Show Component Usage** — list the files that import the selected component (from the codemap's
  `usedBy` edges); click one to open it.
- **Copy Component Path** — copy the resolved source path.

A clicked element still auto-opens its source (per the acceptance criteria); the buttons let you
re-open, jump to the route, or explore usages without losing your place. A webview load failure
(e.g. the dev server isn't up yet) shows an inline **Retry** banner over the page.

---

## Manual testing

1. Open a Next.js project; start the dev server (the panel's **Start dev server** button reuses the
   terminal/task runner, or use your own). The dev-server strip probes ports 3000/3001/5173/5174/8080.
2. Open the **Browser** panel (Globe in the activity bar), load `http://localhost:3000`.
3. Toggle **Inspect** — the cursor becomes a crosshair; hovering outlines elements and shows a
   tooltip with component / file / route.
4. Click an element: the page click is suppressed and Forge opens the mapped source in Monaco,
   jumping to the line when known.
5. Navigate to a nested route and click an element whose component is unknown → Forge opens the
   route's `page.tsx`.
6. Turn Inspect off → the page behaves normally (clicks are not intercepted).

---

## Known limitations (Phase 1)

- **Opening source switches the active tab** away from the Browser tab (the webview unmounts and
  reloads when you return). The inspector's action buttons mitigate this (re-open / route / usages
  without re-clicking), but a future phase can open source in a split so the browser stays visible.
- **Fiber `_debugSource`** depends on the app's dev build emitting it (Next.js/CRA dev do; some Vite
  setups need `@vitejs/plugin-react` with the automatic runtime). Without it, resolution falls back
  to the component-name index and route mapping. React 19 may omit `_debugSource`; the component
  index and route mapping cover that case.
- **Inline-script injection** can be blocked by a strict page `Content-Security-Policy`
  (`script-src`). Local dev servers rarely set one; when blocked, the inspector degrades to DOM +
  route/URL fallbacks.
- **Component index freshness**: the index is the Codebase Map, built on first click and cached in
  main (incrementally re-parsed by mtime). Rebuild the Codebase Map to pick up brand-new components.

## Next recommended step

**Step 7 — build-time metadata injection** (`@forge-dev/component-inspector`): a dev-only Babel/SWC
or Vite plugin that stamps `data-forge-source-file` / `-line` on host DOM elements, giving
exact-source resolution (Strategy 1) without relying on fiber `_debugSource`. Must be
development-only, opt-in, and never modify user source files.
