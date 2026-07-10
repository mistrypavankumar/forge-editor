import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  Crosshair,
  Globe,
  Play,
  Copy,
  FileCode2,
  Loader2,
} from 'lucide-react';
import type { BrowserInspectorSelection, CodeNode } from '@shared/ipc-contract';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useTasksStore } from '../stores/tasks-store';
import { useLayoutStore } from '../stores/layout-store';
import { runInTerminal } from '../lib/terminal-exec';
import { openFilePath } from '../lib/workspace-actions';
import { cn } from '../lib/cn';
import {
  useBrowserStore,
  registerBrowserController,
  DEFAULT_DEV_PORTS,
  type BrowserController,
} from './store';
import { matchComponents, matchRouteFile, resolveSourceFile, type ComponentMatch } from './resolver';

/** Minimal typing for the Electron <webview> element (only the members we use). */
interface WebviewElement extends HTMLElement {
  src: string;
  reload(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  loadURL(url: string): Promise<void>;
  send(channel: string, ...args: unknown[]): void;
}

const SELECTION_CHANNEL = 'forge:inspect:selection';
const NAV_CHANNEL = 'forge:inspect:nav';
const MODE_CHANNEL = 'forge:inspect:mode';

/** Normalize an address-bar entry into a loadable URL (default scheme, localhost shortcuts). */
function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^localhost(:\d+)?/i.test(v) || /^\d+\.\d+\.\d+\.\d+/.test(v)) return `http://${v}`;
  if (/^\d{2,5}$/.test(v)) return `http://localhost:${v}`;
  return `http://${v}`;
}

export function BrowserView(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const store = useBrowserStore();
  const {
    url,
    inspectMode,
    selection,
    matches,
    message,
    devServers,
    loading,
    canGoBack,
    canGoForward,
    currentUrl,
  } = store;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  const nodesRef = useRef<CodeNode[] | null>(null);
  const rootRef = useRef<string | null>(rootPath);
  const [addr, setAddr] = useState(url);
  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);

  rootRef.current = rootPath;

  // Open a source file at a position, reusing the editor's standard open+reveal flow.
  const openAt = useCallback((path: string, line: number, column: number): void => {
    void openFilePath(path).then(() =>
      useEditorStore.getState().requestReveal({ path, line, col: column }),
    );
  }, []);

  // Build (or reuse) the Codebase Map node index for component/route resolution.
  const ensureNodes = useCallback(async (): Promise<CodeNode[] | null> => {
    if (nodesRef.current) return nodesRef.current;
    const root = rootRef.current;
    if (!root) return null;
    const res = await window.forge.codemapBuild(root);
    if (res.ok) nodesRef.current = res.data.nodes;
    return nodesRef.current;
  }, []);

  // The core resolution flow: strongest signal first (metadata → fiber → component → route).
  const resolveAndOpen = useCallback(
    async (sel: BrowserInspectorSelection): Promise<void> => {
      const root = rootRef.current;
      const s = useBrowserStore.getState();
      s.setMatches([]);
      s.setMessage(null);

      // 1. Build-time metadata (data-forge-*).
      const metaFile = resolveSourceFile(sel.forgeMetadata?.sourceFile, root);
      if (metaFile) {
        openAt(metaFile, sel.forgeMetadata?.line ?? 1, sel.forgeMetadata?.column ?? 1);
        return;
      }
      // 2. React fiber source (dev builds).
      const fiberFile = resolveSourceFile(sel.react?.source?.fileName, root);
      if (fiberFile) {
        openAt(fiberFile, sel.react?.source?.lineNumber ?? 1, sel.react?.source?.columnNumber ?? 1);
        return;
      }
      const nodes = await ensureNodes();
      // 3. Component name → project index.
      const name = sel.react?.componentName;
      if (name && nodes) {
        const found = matchComponents(name, nodes);
        if (found.length === 1) {
          openAt(found[0].path, found[0].line, found[0].column);
          return;
        }
        if (found.length > 1) {
          s.setMatches(found);
          s.setMessage(`${found.length} files export "${name}" — choose one.`);
          return;
        }
      }
      // 4. URL → Next.js route file.
      if (nodes) {
        const route = matchRouteFile(sel.routePath ?? sel.url, nodes);
        if (route) {
          s.setMessage(`No exact component match — opened the route file for ${route.route}.`);
          openAt(route.path, route.line, route.column);
          return;
        }
      }
      // 5. Give up gracefully.
      const hint = name
        ? `Component "${name}" isn't in the index yet.`
        : 'No React component info on this element.';
      s.setMessage(`${hint} Try rebuilding the Codebase Map, or pick a file manually.`);
    },
    [ensureNodes, openAt],
  );

  // Handle a selection message coming from the guest page.
  const onSelection = useCallback(
    (sel: BrowserInspectorSelection): void => {
      const s = useBrowserStore.getState();
      if (sel.phase === 'hover') {
        s.setHover(sel);
        return;
      }
      s.setSelection(sel);
      s.setHover(sel);
      void resolveAndOpen(sel);
    },
    [resolveAndOpen],
  );

  // Resolve the webview preload path once (main returns its file:// URL).
  useEffect(() => {
    let alive = true;
    void window.forge.browserPreloadPath().then((res) => {
      if (alive && res.ok) setPreloadUrl(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Create the <webview> imperatively so it persists across React re-renders (setting src via JSX
  // on every render would reload the page). Rebuilt only when the preload URL first resolves.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !preloadUrl) return;
    const initial = normalizeUrl(useBrowserStore.getState().currentUrl || useBrowserStore.getState().url);
    const wv = document.createElement('webview') as WebviewElement;
    wv.setAttribute('partition', 'persist:forge-browser');
    wv.setAttribute('preload', preloadUrl);
    wv.setAttribute('allowpopups', 'false');
    wv.setAttribute('src', initial);
    wv.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
    webviewRef.current = wv;

    const setNav = useBrowserStore.getState().setNav;
    const onStart = (): void => setNav({ loading: true });
    const onStop = (): void =>
      setNav({ loading: false, canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward() });
    const onNavigate = (e: Event): void => {
      const url = (e as Event & { url?: string }).url;
      if (url) {
        setNav({ currentUrl: url, canGoBack: wv.canGoBack(), canGoForward: wv.canGoForward() });
        setAddr(url);
      }
    };
    const onDomReady = (): void => {
      // Re-assert inspect mode after each load (the guest re-injects its inspector per page).
      wv.send(MODE_CHANNEL, useBrowserStore.getState().inspectMode);
    };
    const onIpc = (e: Event): void => {
      const ev = e as Event & { channel: string; args: unknown[] };
      if (ev.channel === SELECTION_CHANNEL) onSelection(ev.args[0] as BrowserInspectorSelection);
      else if (ev.channel === NAV_CHANNEL) {
        const nav = ev.args[0] as { url?: string };
        if (nav?.url) setAddr(nav.url);
      }
    };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('ipc-message', onIpc);
    container.appendChild(wv);

    const controller: BrowserController = {
      reload: () => wv.reload(),
      back: () => wv.canGoBack() && wv.goBack(),
      forward: () => wv.canGoForward() && wv.goForward(),
      loadUrl: (u) => void wv.loadURL(normalizeUrl(u)),
      openSelectedSource: () => {
        const sel = useBrowserStore.getState().selection;
        if (sel) void resolveAndOpen(sel);
      },
    };
    registerBrowserController(controller);

    return () => {
      registerBrowserController(null);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('ipc-message', onIpc);
      wv.remove();
      webviewRef.current = null;
    };
  }, [preloadUrl, onSelection, resolveAndOpen]);

  // Push inspect-mode changes to the guest page.
  useEffect(() => {
    webviewRef.current?.send(MODE_CHANNEL, inspectMode);
  }, [inspectMode]);

  // Probe common dev-server ports on mount.
  useEffect(() => {
    void window.forge.browserProbePorts(DEFAULT_DEV_PORTS).then((res) => {
      if (res.ok) useBrowserStore.getState().setDevServers(res.data);
    });
  }, []);

  const load = (raw: string): void => {
    const u = normalizeUrl(raw);
    if (!u) return;
    useBrowserStore.getState().setUrl(u);
    setAddr(u);
    webviewRef.current?.loadURL(u).catch(() => {
      /* invalid URL — webview shows its own error page */
    });
  };

  const startDevServer = async (): Promise<void> => {
    const root = rootRef.current;
    if (!root) return;
    const pm = useTasksStore.getState().pm;
    let cmd = `${pm} run dev`;
    const pkg = await window.forge.readFile(`${root}/package.json`);
    if (pkg.ok) {
      try {
        const scripts = (JSON.parse(pkg.data).scripts ?? {}) as Record<string, string>;
        const name = ['dev', 'start', 'serve'].find((n) => scripts[n]);
        if (name) cmd = `${pm} run ${name}`;
      } catch {
        /* keep default */
      }
    }
    useLayoutStore.getState().setBottomTab('terminal');
    useLayoutStore.getState().setPanelVisible('bottom', true);
    const id = useTerminalStore.getState().newTerminal('Dev Server', 'dev');
    runInTerminal(id, cmd);
  };

  const running = devServers.filter((d) => d.running);
  const details = selection ?? store.hover;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-2">
        <ToolbarButton title="Back" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()}>
          <ArrowLeft size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Forward"
          disabled={!canGoForward}
          onClick={() => webviewRef.current?.goForward()}
        >
          <ArrowRight size={16} />
        </ToolbarButton>
        <ToolbarButton title="Refresh" onClick={() => webviewRef.current?.reload()}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
        </ToolbarButton>
        <form
          className="flex min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            load(addr);
          }}
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            spellCheck={false}
            placeholder="http://localhost:3000"
            className="min-w-0 flex-1 rounded bg-surface px-2.5 py-1 text-xs text-fg outline-none ring-1 ring-line focus:ring-accent"
          />
        </form>
        <ToolbarButton
          title="Open in external browser"
          onClick={() => void window.forge.openExternal(currentUrl || normalizeUrl(addr))}
        >
          <ExternalLink size={16} />
        </ToolbarButton>
        <button
          type="button"
          title="Toggle Inspect Mode"
          onClick={() => useBrowserStore.getState().toggleInspectMode()}
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
            inspectMode
              ? 'bg-accent text-accent-fg'
              : 'text-faint ring-1 ring-line hover:text-fg',
          )}
        >
          <Crosshair size={15} />
          Inspect
        </button>
      </div>

      {/* Dev server status strip */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line px-2.5 text-[11px] text-faint">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            running.length ? 'bg-success' : 'bg-faint/40',
          )}
        />
        {running.length ? (
          <>
            <span>Dev server:</span>
            {running.map((d) => (
              <button
                key={d.port}
                type="button"
                onClick={() => load(d.url)}
                className="rounded px-1.5 py-0.5 text-accent hover:bg-surface"
              >
                {d.url}
              </button>
            ))}
          </>
        ) : (
          <>
            <span>No dev server detected on {DEFAULT_DEV_PORTS.join(', ')}.</span>
            <button
              type="button"
              onClick={() => void startDevServer()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent hover:bg-surface"
            >
              <Play size={11} /> Start dev server
            </button>
          </>
        )}
      </div>

      {/* Browser + inspector */}
      <div className="flex min-h-0 flex-1">
        <div ref={containerRef} className="relative min-h-0 flex-1 bg-white">
          {!preloadUrl ? (
            <div className="flex h-full items-center justify-center text-xs text-faint">
              Preparing browser…
            </div>
          ) : null}
        </div>
        <InspectorPanel
          details={details}
          matches={matches}
          message={message}
          inspectMode={inspectMode}
          onOpenMatch={(m) => openAt(m.path, m.line, m.column)}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-faint transition-colors hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function InspectorPanel({
  details,
  matches,
  message,
  inspectMode,
  onOpenMatch,
}: {
  details: BrowserInspectorSelection | null;
  matches: ComponentMatch[];
  message: string | null;
  inspectMode: boolean;
  onOpenMatch: (m: ComponentMatch) => void;
}): React.JSX.Element {
  const component =
    details?.forgeMetadata?.component || details?.react?.componentName || 'Unknown';
  const file =
    details?.forgeMetadata?.sourceFile || details?.react?.source?.fileName || null;
  const copy = (text: string): void => void navigator.clipboard?.writeText(text);

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface text-xs">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 font-medium text-fg">
        <Globe size={14} /> Inspector
      </div>
      {!inspectMode ? (
        <p className="px-3 py-3 leading-relaxed text-faint">
          Enable <span className="text-fg">Inspect</span> mode, then hover and click an element in
          the page to jump to its source.
        </p>
      ) : !details ? (
        <p className="px-3 py-3 leading-relaxed text-faint">
          Hover over the page to inspect elements. Click one to open its source.
        </p>
      ) : (
        <div className="flex flex-col gap-3 px-3 py-3">
          <Field label="Component" value={component} onCopy={() => copy(component)} />
          {file ? <Field label="Source file" value={file} onCopy={() => copy(file)} mono /> : null}
          {details.routePath ? <Field label="Route" value={details.routePath} /> : null}
          <Field
            label="DOM"
            value={
              details.dom.tagName +
              (details.dom.id ? `#${details.dom.id}` : '') +
              (details.dom.className
                ? '.' + String(details.dom.className).split(' ').filter(Boolean).slice(0, 3).join('.')
                : '')
            }
            mono
          />
          {details.dom.text ? <Field label="Text" value={details.dom.text} /> : null}
          <ConfidencePill confidence={details.confidence} />
          {details.react?.ownerChain?.length ? (
            <div>
              <div className="mb-1 text-faint">Parent components</div>
              <div className="flex flex-col gap-0.5">
                {details.react.ownerChain.map((name, i) => (
                  <div key={`${name}-${i}`} className="pl-2 text-fg" style={{ paddingLeft: 8 + i * 8 }}>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {message ? <div className="border-t border-line px-3 py-2 text-warning">{message}</div> : null}

      {matches.length > 1 ? (
        <div className="border-t border-line px-3 py-2">
          <div className="mb-1.5 text-faint">Pick a source file:</div>
          <div className="flex flex-col gap-1">
            {matches.map((m) => (
              <button
                key={m.path}
                type="button"
                onClick={() => onOpenMatch(m)}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-fg hover:bg-bg"
              >
                <FileCode2 size={13} className="shrink-0 text-accent" />
                <span className="truncate">{m.rel}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-faint">
        <span>{label}</span>
        {onCopy ? (
          <button type="button" title="Copy" onClick={onCopy} className="hover:text-fg">
            <Copy size={11} />
          </button>
        ) : null}
      </div>
      <div className={cn('break-words text-fg', mono && 'font-mono text-[11px]')}>{value}</div>
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: 'high' | 'medium' | 'low' }): React.JSX.Element {
  const color =
    confidence === 'high'
      ? 'bg-success/15 text-success'
      : confidence === 'medium'
        ? 'bg-warning/15 text-warning'
        : 'bg-faint/15 text-faint';
  return (
    <div>
      <div className="mb-0.5 text-faint">Confidence</div>
      <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase', color)}>
        {confidence}
      </span>
    </div>
  );
}
