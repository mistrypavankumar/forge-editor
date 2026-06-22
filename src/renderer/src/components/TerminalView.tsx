import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { registerExec, unregisterExec } from '../lib/terminal-exec';

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
      theme: {
        background: '#080B12',
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

    // File paths: Cmd/Ctrl+click opens the file (or scopes the folder) in-editor.
    const openPathLink = (token: string): void => {
      const lc = /:(\d+)(?::(\d+))?$/.exec(token);
      const path = lc ? token.slice(0, lc.index) : token;
      const line = lc ? Number(lc[1]) : 0;
      const col = lc && lc[2] ? Number(lc[2]) : 1;
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

    term.registerLinkProvider({
      provideLinks(y, callback) {
        const bufferLine = term.buffer.active.getLine(y - 1);
        if (!bufferLine) {
          callback(undefined);
          return;
        }
        const text = bufferLine.translateToString(true);
        const re = /(?<![\w:/])(\/[^\s:'"()[\]]+)(?::\d+)?(?::\d+)?/g;
        const links = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const full = m[0];
          const startX = m.index + 1;
          links.push({
            text: full,
            range: { start: { x: startX, y }, end: { x: startX + full.length - 1, y } },
            activate: (event: MouseEvent) => {
              if (event.metaKey || event.ctrlKey) openPathLink(full);
            },
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
