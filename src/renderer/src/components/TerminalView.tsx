import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { registerExec, unregisterExec } from '../lib/terminal-exec';

const ACCENT = '\x1b[38;2;124;130;245m';
const MUTED = '\x1b[38;2;124;124;135m';
const GREEN = '\x1b[38;2;61;220;151m';
const RED = '\x1b[38;2;248;113;113m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function basename(p: string | null): string {
  if (!p) return 'forge';
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'forge';
}

export function TerminalView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootRef = useRef(rootPath);
  rootRef.current = rootPath;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const runningRef = { current: false };
    const lineRef = { current: '' };

    const term = new Terminal({
      fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      theme: {
        background: '#0d0d11',
        foreground: '#e7e7ea',
        cursor: '#7c82f5',
        cursorAccent: '#0d0d11',
        selectionBackground: '#7c82f540',
        black: '#1c1c21',
        red: '#f87171',
        green: '#3ddc97',
        yellow: '#f5c451',
        blue: '#5b9df0',
        magenta: '#c792ea',
        cyan: '#22d3ee',
        white: '#cdcdd4',
        brightBlack: '#5c5c66',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

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
      term.write(`\r\n${ACCENT}╭─${RESET} ${BOLD}${folder}${RESET}\r\n${ACCENT}╰─❯${RESET} `);
    };

    term.writeln(`${ACCENT}▌${RESET} ${BOLD}Forge${RESET} ${MUTED}terminal${RESET}`);
    term.writeln(`${MUTED}  commands run in the open folder · Ctrl+C to cancel${RESET}`);
    writePrompt();

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

    const erase = (n: number): void => {
      if (n > 0) term.write('\b \b'.repeat(n));
    };
    const deleteWord = (): void => {
      const line = lineRef.current;
      let i = line.length;
      while (i > 0 && line[i - 1] === ' ') i--;
      while (i > 0 && line[i - 1] !== ' ') i--;
      erase(line.length - i);
      lineRef.current = line.slice(0, i);
    };
    const deleteLine = (): void => {
      erase(lineRef.current.length);
      lineRef.current = '';
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
      if (d === '\x0c') {
        term.clear();
        lineRef.current = '';
        writePrompt();
        return;
      }
      if (d === '\r') {
        const cmd = lineRef.current.trim();
        lineRef.current = '';
        term.write('\r\n');
        if (cmd === 'clear' || cmd === 'cls') {
          term.clear();
          writePrompt();
        } else if (cmd) {
          exec(cmd);
        } else {
          writePrompt();
        }
      } else if (d === '\x7f') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (d >= ' ') {
        lineRef.current += d;
        term.write(d);
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
    };
  }, [sessionId]);

  return <div ref={containerRef} className="h-full px-3 py-2" />;
}
