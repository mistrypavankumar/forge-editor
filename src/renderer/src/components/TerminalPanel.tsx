import { useEffect, useRef } from 'react';
import { Play, TerminalSquare } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useNavigatorStore } from '../stores/navigator-store';

const QUICK_TASKS = [
  { id: 'dev', label: 'Dev', command: 'npm run dev' },
  { id: 'test', label: 'Test', command: 'npm run test' },
  { id: 'build', label: 'Build', command: 'npm run build' },
  { id: 'lint', label: 'Lint', command: 'npm run lint' },
];

const TERM_ID = 'main';

// Truecolor ANSI helpers (match the app accent / semantic palette).
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

export function TerminalPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const runningRef = useRef(false);
  const lineRef = useRef('');
  const execRef = useRef<(command: string) => void>(() => {});
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootRef = useRef(rootPath);
  rootRef.current = rootPath;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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
      void window.forge.readFile(path).then((res) => {
        if (res.ok) {
          const name = path.slice(path.lastIndexOf('/') + 1);
          useEditorStore.getState().openFile({ path, name, content: res.data });
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

    term.open(el);
    fit.fit();
    termRef.current = term;

    const writePrompt = (): void => {
      const folder = basename(rootRef.current);
      term.write(`\r\n${ACCENT}╭─${RESET} ${BOLD}${folder}${RESET}\r\n${ACCENT}╰─❯${RESET} `);
    };

    // Banner
    term.writeln(`${ACCENT}▌${RESET} ${BOLD}Forge${RESET} ${MUTED}terminal${RESET}`);
    term.writeln(`${MUTED}  commands run in the open folder · Ctrl+C to cancel${RESET}`);
    writePrompt();

    const exec = (command: string): void => {
      runningRef.current = true;
      void window.forge.runCommand({ id: TERM_ID, command, cwd: rootRef.current ?? undefined });
    };
    execRef.current = (command) => {
      if (runningRef.current) return;
      term.write(command + '\r\n');
      exec(command);
    };

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

    // Option+Backspace = delete word, Cmd+Backspace = delete line.
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

    const offData = window.forge.onTerminalData(({ chunk }) => term.write(chunk));
    const offExit = window.forge.onTerminalExit(({ code }) => {
      runningRef.current = false;
      const dot = code === 0 ? `${GREEN}●${RESET}` : `${RED}●${RESET}`;
      term.write(`\r\n${dot} ${MUTED}exited ${code}${RESET}\r\n`);
      writePrompt();
    });

    const dataSub = term.onData((d) => {
      if (runningRef.current) {
        if (d === '\x03') window.forge.killCommand(TERM_ID); // Ctrl+C
        return;
      }
      if (d === '\x0c') {
        // Ctrl+L — clear
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
      offData();
      offExit();
      dataSub.dispose();
      resizeObs.disconnect();
      window.forge.killCommand(TERM_ID);
      term.dispose();
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#0d0d11]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft bg-surface px-3 py-1.5">
        <TerminalSquare size={13} className="text-accent" />
        <span className="mr-1.5 text-[11px] font-medium text-muted">zsh</span>
        <span className="h-3 w-px bg-line" />
        <span className="mx-1 text-[11px] text-faint">Tasks</span>
        {QUICK_TASKS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.command}
            onClick={() => execRef.current(t.command)}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Play size={10} className="fill-current text-accent" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/60 via-accent/20 to-transparent" />
        <div ref={containerRef} className="h-full px-3 py-2" />
      </div>
    </div>
  );
}
