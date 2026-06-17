import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { registerExec, unregisterExec } from '../lib/terminal-exec';

const ACCENT = '\x1b[38;2;124;92;255m';
const MUTED = '\x1b[38;2;107;118;138m';
const GREEN = '\x1b[38;2;61;220;151m';
const RED = '\x1b[38;2;255;92;122m';
const GIT = '\x1b[38;2;139;115;255m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function basename(p: string | null): string {
  if (!p) return 'forge';
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'forge';
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

  // A terminal opened in a hidden (display:none) pane never paints; refit +
  // repaint whenever this pane becomes visible (tab switch / split).
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      fitRef.current?.fit();
      const t = termRef.current;
      if (t) t.refresh(0, Math.max(t.rows - 1, 0));
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const runningRef = { current: false };
    const lineRef = { current: '' };
    const posRef = { current: 0 };
    const branchRef = { current: null as string | null };

    const term = new Terminal({
      fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
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

    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (event.metaKey || event.ctrlKey) void window.forge.openExternal(uri);
      }),
    );

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

    const writePrompt = (): void => {
      const folder = basename(rootRef.current);
      const branch = branchRef.current;
      const gitPart = branch ? ` ${MUTED}on${RESET} ${GIT}⎇ ${branch}${RESET}` : '';
      term.write(`${ACCENT}╭─${RESET} ${BOLD}${folder}${RESET}${gitPart}\r\n${ACCENT}╰─❯${RESET} `);
    };

    // Resolve the git branch, then draw the first prompt.
    void window.forge.gitBranch(rootRef.current ?? '').then((res) => {
      branchRef.current = res.ok ? res.data : null;
      writePrompt();
    });

    const exec = (command: string): void => {
      runningRef.current = true;
      void window.forge.runCommand({ id: sessionId, command, cwd: rootRef.current ?? undefined });
    };
    registerExec(sessionId, (command) => {
      if (runningRef.current) return;
      term.write(command + '\r\n');
      exec(command);
    });

    const offData = window.forge.onTerminalData((e) => {
      if (e.id === sessionId) term.write(e.chunk);
    });
    const offExit = window.forge.onTerminalExit((e) => {
      if (e.id !== sessionId) return;
      runningRef.current = false;
      const dot = e.code === 0 ? `${GREEN}●${RESET}` : `${RED}●${RESET}`;
      term.write(`\r\n${dot} ${MUTED}exited ${e.code}${RESET}\r\n`);
      writePrompt();
    });

    const resetLine = (): void => {
      lineRef.current = '';
      posRef.current = 0;
    };
    const insertStr = (str: string): void => {
      const line = lineRef.current;
      const pos = posRef.current;
      const newLine = line.slice(0, pos) + str + line.slice(pos);
      lineRef.current = newLine;
      const tail = newLine.slice(pos + str.length);
      term.write(str + tail + '\x1b[D'.repeat(tail.length));
      posRef.current = pos + str.length;
    };
    const backspaceAt = (): void => {
      const line = lineRef.current;
      const pos = posRef.current;
      if (pos === 0) return;
      const newLine = line.slice(0, pos - 1) + line.slice(pos);
      lineRef.current = newLine;
      const tail = newLine.slice(pos - 1);
      term.write('\b' + tail + ' ' + '\x1b[D'.repeat(tail.length + 1));
      posRef.current = pos - 1;
    };
    const deleteWord = (): void => {
      const line = lineRef.current;
      let i = posRef.current;
      while (i > 0 && line[i - 1] === ' ') i--;
      while (i > 0 && line[i - 1] !== ' ') i--;
      const count = posRef.current - i;
      for (let k = 0; k < count; k++) backspaceAt();
    };
    const deleteLine = (): void => {
      const line = lineRef.current;
      const fwd = line.length - posRef.current;
      if (fwd > 0) term.write('\x1b[C'.repeat(fwd));
      term.write('\b \b'.repeat(line.length));
      resetLine();
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || runningRef.current) return true;
      if (e.key === 'Backspace' && (e.altKey || e.metaKey)) {
        e.preventDefault();
        if (e.metaKey) deleteLine();
        else deleteWord();
        return false;
      }
      return true;
    });

    const dataSub = term.onData((d) => {
      if (runningRef.current) {
        if (d === '\x03') window.forge.killCommand(sessionId);
        return;
      }
      switch (d) {
        case '\r': {
          const cmd = lineRef.current.trim();
          resetLine();
          term.write('\r\n');
          if (cmd === 'clear' || cmd === 'cls') {
            term.clear();
            writePrompt();
          } else if (cmd) {
            exec(cmd);
          } else {
            writePrompt();
          }
          return;
        }
        case '\x7f':
          backspaceAt();
          return;
        case '\x0c':
          term.clear();
          resetLine();
          writePrompt();
          return;
        case '\x1b[D': // left
          if (posRef.current > 0) {
            posRef.current -= 1;
            term.write('\x1b[D');
          }
          return;
        case '\x1b[C': // right
          if (posRef.current < lineRef.current.length) {
            posRef.current += 1;
            term.write('\x1b[C');
          }
          return;
        case '\x1b[H':
        case '\x1b[1~': // home
          if (posRef.current > 0) term.write('\x1b[D'.repeat(posRef.current));
          posRef.current = 0;
          return;
        case '\x1b[F':
        case '\x1b[4~': {
          // end
          const fwd = lineRef.current.length - posRef.current;
          if (fwd > 0) term.write('\x1b[C'.repeat(fwd));
          posRef.current = lineRef.current.length;
          return;
        }
        case '\x1b[A':
        case '\x1b[B': // up/down — no history yet
          return;
        default:
          if (d >= ' ' && !d.startsWith('\x1b')) insertStr(d);
      }
    });

    const resizeObs = new ResizeObserver(() => fit.fit());
    resizeObs.observe(el);

    return () => {
      unregisterExec(sessionId);
      offData();
      offExit();
      dataSub.dispose();
      resizeObs.disconnect();
      window.forge.killCommand(sessionId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  return <div ref={containerRef} className="h-full px-3 py-2" />;
}
