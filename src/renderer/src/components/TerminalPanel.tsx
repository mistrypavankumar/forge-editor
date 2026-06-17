import { Play, Plus, SplitSquareHorizontal, X, TerminalSquare } from 'lucide-react';
import { useTerminalStore } from '../stores/terminal-store';
import { runInTerminal } from '../lib/terminal-exec';
import { TerminalView } from './TerminalView';
import { cn } from '../lib/cn';

const QUICK_TASKS = [
  { id: 'dev', label: 'Dev', command: 'npm run dev' },
  { id: 'test', label: 'Test', command: 'npm run test' },
  { id: 'build', label: 'Build', command: 'npm run build' },
  { id: 'lint', label: 'Lint', command: 'npm run lint' },
];

export function TerminalPanel(): React.JSX.Element {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeId = useTerminalStore((s) => s.activeId);
  const splitId = useTerminalStore((s) => s.splitId);
  const setActive = useTerminalStore((s) => s.setActive);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const toggleSplit = useTerminalStore((s) => s.toggleSplit);

  const split = splitId !== null;

  return (
    <div className="flex h-full flex-col bg-[#0d0d11]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft bg-surface px-3 py-1.5">
        <TerminalSquare size={13} className="text-accent" />
        <span className="mr-1 text-[11px] text-faint">Tasks</span>
        {QUICK_TASKS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={`${t.command} (in active terminal)`}
            onClick={() => runInTerminal(activeId, t.command)}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Play size={10} className="fill-current text-accent" />
            {t.label}
          </button>
        ))}

        {/* Session tabs + controls */}
        <div className="ml-auto flex items-center gap-1">
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            const isSplit = s.id === splitId;
            return (
              <span
                key={s.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : isSplit
                      ? 'bg-surface-3 text-fg'
                      : 'text-faint hover:text-muted',
                )}
              >
                <button type="button" onClick={() => setActive(s.id)} title={s.title}>
                  {s.title}
                </button>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Close ${s.title}`}
                    onClick={() => closeSession(s.id)}
                    className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                ) : null}
              </span>
            );
          })}
          <button
            type="button"
            aria-label="New terminal"
            title="New terminal"
            onClick={() => createSession()}
            className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            aria-label="Split terminal"
            title="Split terminal"
            onClick={toggleSplit}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded hover:bg-surface-3 hover:text-fg',
              split ? 'text-accent' : 'text-faint',
            )}
          >
            <SplitSquareHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* Panes — all sessions stay mounted (preserving scrollback/process); hidden ones are display:none. */}
      <div className="relative flex min-h-0 flex-1">
        <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-accent/60 via-accent/20 to-transparent" />
        {sessions.map((s) => {
          const visible = s.id === activeId || s.id === splitId;
          return (
            <div
              key={s.id}
              onMouseDown={() => setActive(s.id)}
              className={cn(
                'h-full overflow-hidden',
                visible ? (split ? 'w-1/2' : 'w-full') : 'hidden',
                visible && split && 'border-l border-line first:border-l-0',
                visible && split && s.id === activeId && 'ring-1 ring-inset ring-accent/30',
              )}
            >
              <TerminalView sessionId={s.id} visible={visible} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
