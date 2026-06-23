import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { useTerminalStore } from '../stores/terminal-store';
import { registerExec, unregisterExec } from '../lib/terminal-exec';

// Single-quote a path for the shell so spaces/specials in the folder name survive
// (closing the quote, escaping any embedded `'`, reopening).
function shellQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export function TerminalView({
  sessionId,
  visible,
}: {
  sessionId: string;
  visible: boolean;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootRef = useRef(rootPath);
  rootRef.current = rootPath;

  // Follow workspace folder switches: the live shell was spawned with the old root's
  // cwd, so `cd` it into the new root. Skip the initial mount (the PTY already spawns
  // in the right place) and any terminal currently running a foreground program — we
  // don't want to inject `cd` into vim/node/claude. `\x15` (Ctrl+U) clears any
  // half-typed line first so we don't append to the user's pending command.
  const firstRoot = useRef(true);
  useEffect(() => {
    if (firstRoot.current) {
      firstRoot.current = false;
      return;
    }
    if (!rootPath) return;
    if (useTerminalStore.getState().sessions[sessionId]?.proc) return;
    window.forge.sendInput(sessionId, `\x15cd ${shellQuote(rootPath)}\r`);
  }, [rootPath, sessionId]);

  // Refit + repaint when this pane becomes visible (split/tab switch).
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      fitRef.current?.fit();
      const t = termRef.current;
      if (t) {
        t.refresh(0, Math.max(t.rows - 1, 0));
        window.forge.resizeTerminal(sessionId, t.cols, t.rows);
        t.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, sessionId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
      fontSize: 12.5,
      fontWeight: 400,
      fontWeightBold: 600,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      // Let the panel's translucent background and the window vibrancy show through the
      // terminal, matching the frosted-glass look of the editor and chrome.
      allowTransparency: true,
      theme: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#C7D2E3',
        cursor: '#8B73FF',
        cursorAccent: '#080B12',
        selectionBackground: '#7C5CFF40',
        black: '#111827',
        red: '#FF5C7A',
        green: '#3DDC97',
        yellow: '#F7B955',
        blue: '#4DBBFF',
        magenta: '#8B73FF',
        cyan: '#4DD0E1',
        white: '#A8B3C7',
        brightBlack: '#6B768A',
        brightRed: '#ff7d95',
        brightGreen: '#6ee7b0',
        brightYellow: '#ffce7a',
        brightBlue: '#7cccff',
        brightMagenta: '#a48bff',
        brightCyan: '#6fe0ee',
        brightWhite: '#D7DEEC',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // xterm measures the glyph cell from whatever font is available at open time. If the
    // JetBrains Mono webfont finishes loading later, that measurement is stale and columns
    // misalign (garbled output). Re-assigning the font forces a re-measure; then refit/repaint.
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      term.options.fontFamily = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
      fit.fit();
      term.refresh(0, Math.max(term.rows - 1, 0));
      window.forge.resizeTerminal(sessionId, term.cols, term.rows);
    });

    // URLs: Cmd/Ctrl+click opens in the external browser.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (event.metaKey || event.ctrlKey) void window.forge.openExternal(uri);
      }),
    );

    // File paths: clicking opens the file (or scopes the folder) in-editor. Handles
    // both absolute paths and relative ones (e.g. ripgrep output like
    // `packages/foo/bar.ts:42`), resolving the latter against the terminal's root.
    const openPathLink = (token: string): void => {
      const lc = /:(\d+)(?::(\d+))?$/.exec(token);
      const rel = lc ? token.slice(0, lc.index) : token;
      const line = lc ? Number(lc[1]) : 0;
      const col = lc && lc[2] ? Number(lc[2]) : 1;
      const root = rootRef.current;
      const path =
        rel.startsWith('/') || !root ? rel : `${root}/${rel.replace(/^\.\//, '')}`;
      void window.forge.readFile(path).then((res) => {
        if (res.ok) {
          const name = path.slice(path.lastIndexOf('/') + 1);
          const store = useEditorStore.getState();
          store.openFile({ path, name, content: res.data });
          if (line > 0) store.requestReveal({ path, line, col });
          return;
        }
        void window.forge.readDirectory(path).then((dr) => {
          if (dr.ok) {
            const ws = useWorkspaceStore.getState();
            ws.setChildren(path, dr.data);
            ws.setScope(path);
            useNavigatorStore.getState().setTab('structure');
          }
        });
      });
    };

    // Only treat a token as a file path when it's absolute, contains a `/`, or ends
    // in a file extension — so plain words, version strings (`v22.18.0`), and counts
    // don't become spurious links. A miss is harmless: the click no-ops if the path
    // can't be read.
    const looksLikePath = (p: string): boolean =>
      p.startsWith('/') || p.includes('/') || /\.[A-Za-z]\w*$/.test(p);

    term.registerLinkProvider({
      provideLinks(y, callback) {
        const bufferLine = term.buffer.active.getLine(y - 1);
        if (!bufferLine) {
          callback(undefined);
          return;
        }
        const text = bufferLine.translateToString(true);
        // A path-ish token (no spaces/quotes/brackets/colons) plus an optional :line:col.
        const re = /(?<![\w:/])([^\s:'"()[\]]+)(?::\d+)?(?::\d+)?/g;
        const links = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          if (!looksLikePath(m[1])) continue;
          const full = m[0];
          const startX = m.index + 1;
          links.push({
            text: full,
            range: { start: { x: startX, y }, end: { x: startX + full.length - 1, y } },
            activate: () => openPathLink(full),
          });
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    // Spawn the real shell (PTY) for this session.
    const created = window.forge.createTerminal({
      id: sessionId,
      cwd: rootRef.current ?? undefined,
      cols: term.cols,
      rows: term.rows,
    });

    const offData = window.forge.onTerminalData((e) => {
      if (e.id === sessionId) term.write(e.chunk);
    });
    const offExit = window.forge.onTerminalExit((e) => {
      if (e.id === sessionId) {
        term.write(`\r\n\x1b[38;2;107;118;138m[process exited ${e.code}]\x1b[0m\r\n`);
      }
    });

    // Map mac line-editing shortcuts to the control sequences the shell expects.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.key === 'Backspace' && e.metaKey) {
        window.forge.sendInput(sessionId, '\x15'); // Ctrl+U — kill line
        return false;
      }
      if (e.key === 'Backspace' && e.altKey) {
        window.forge.sendInput(sessionId, '\x1b\x7f'); // Alt+Backspace — kill word
        return false;
      }
      return true;
    });

    // Raw passthrough — the shell handles editing, history, programs like `claude`.
    const dataSub = term.onData((d) => window.forge.sendInput(sessionId, d));

    // Wait for the PTY to exist before writing — a task may run in a just-created terminal.
    registerExec(sessionId, (command) => {
      void created.then(() => window.forge.sendInput(sessionId, `${command}\r`));
    });

    const resizeObs = new ResizeObserver(() => {
      fit.fit();
      window.forge.resizeTerminal(sessionId, term.cols, term.rows);
    });
    resizeObs.observe(el);

    // Focus so keystrokes are captured immediately; also focus on click.
    term.focus();
    const focusOnClick = (): void => term.focus();
    el.addEventListener('mousedown', focusOnClick);

    return () => {
      disposed = true;
      unregisterExec(sessionId);
      offData();
      offExit();
      dataSub.dispose();
      resizeObs.disconnect();
      el.removeEventListener('mousedown', focusOnClick);
      window.forge.killCommand(sessionId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  return <div ref={containerRef} className="h-full px-3 py-2" />;
}
