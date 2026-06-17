import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useWorkspaceStore } from '../stores/workspace-store';

const QUICK_TASKS = [
  { id: 'dev', label: 'Dev', command: 'npm run dev' },
  { id: 'test', label: 'Test', command: 'npm run test' },
  { id: 'build', label: 'Build', command: 'npm run build' },
  { id: 'lint', label: 'Lint', command: 'npm run lint' },
];

const TERM_ID = 'main';
const PROMPT = '\x1b[38;5;111m❯\x1b[0m ';

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
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: true,
      theme: {
        background: '#141417',
        foreground: '#e7e7ea',
        cursor: '#7079f5',
        selectionBackground: '#7079f540',
        black: '#141417',
        brightBlack: '#7c7c87',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = term;
    term.writeln('\x1b[90mForge terminal — runs commands in the open folder.\x1b[0m');
    term.write(PROMPT);

    const exec = (command: string): void => {
      runningRef.current = true;
      void window.forge.runCommand({ id: TERM_ID, command, cwd: rootRef.current ?? undefined });
    };
    execRef.current = (command) => {
      if (runningRef.current) return;
      term.write(`${command}\r\n`);
      exec(command);
    };

    const offData = window.forge.onTerminalData(({ chunk }) => term.write(chunk));
    const offExit = window.forge.onTerminalExit(({ code }) => {
      runningRef.current = false;
      term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`);
      term.write(PROMPT);
    });

    const dataSub = term.onData((d) => {
      if (runningRef.current) {
        if (d === '\x03') window.forge.killCommand(TERM_ID); // Ctrl+C
        return;
      }
      if (d === '\r') {
        const cmd = lineRef.current.trim();
        lineRef.current = '';
        term.write('\r\n');
        if (cmd) exec(cmd);
        else term.write(PROMPT);
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
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft px-3 py-1.5">
        <span className="mr-1 text-[11px] text-faint">Tasks</span>
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
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
    </div>
  );
}
