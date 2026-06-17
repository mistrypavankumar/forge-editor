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
  const groups = useTerminalStore((s) => s.groups);
  const activeGroupId = useTerminalStore((s) => s.activeGroupId);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const newTerminal = useTerminalStore((s) => s.newTerminal);
  const splitActive = useTerminalStore((s) => s.splitActive);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const focusSession = useTerminalStore((s) => s.focusSession);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const activeSessions = new Set(activeGroup?.sessions ?? []);
  const allSessions = Object.values(sessions);

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft bg-surface px-3 py-1.5">
        <TerminalSquare size={13} className="text-accent" />
        <span className="mr-1 text-[11px] text-faint">Tasks</span>
        {QUICK_TASKS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={`${t.command} (in active terminal)`}
            onClick={() => runInTerminal(activeSessionId, t.command)}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Play size={10} className="fill-current text-accent" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Panes — all sessions stay mounted; only the active group's are visible. */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-accent/60 via-accent/20 to-transparent" />
          {allSessions.map((s) => {
            const inGroup = activeSessions.has(s.id);
            return (
              <div
                key={s.id}
                onMouseDown={() => focusSession(s.id)}
                className={cn(
                  'h-full overflow-hidden border-line',
                  inGroup ? 'flex-1 border-l first:border-l-0' : 'hidden',
                  inGroup &&
                    activeSessions.size > 1 &&
                    s.id === activeSessionId &&
                    'ring-1 ring-inset ring-accent/30',
                )}
              >
                <TerminalView sessionId={s.id} visible={inGroup} />
              </div>
            );
          })}
        </div>

        {/* Terminal list */}
        <aside className="flex w-52 shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex h-8 shrink-0 items-center justify-end gap-1 border-b border-line-soft px-2">
            <button
              type="button"
              aria-label="New terminal"
              title="New terminal"
              onClick={newTerminal}
              className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              aria-label="Split terminal"
              title="Split terminal"
              onClick={splitActive}
              className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
            >
              <SplitSquareHorizontal size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {groups.map((g) =>
              g.sessions.map((sid, i) => {
                const s = sessions[sid];
                if (!s) return null;
                const multi = g.sessions.length > 1;
                const conn = !multi ? '' : i === 0 ? '┌' : i === g.sessions.length - 1 ? '└' : '├';
                const isActive = sid === activeSessionId;
                return (
                  <div
                    key={sid}
                    onClick={() => focusSession(sid)}
                    className={cn(
                      'group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-[12px]',
                      isActive ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2',
                    )}
                  >
                    <span className="w-3 text-center font-mono text-faint">{conn}</span>
                    <TerminalSquare
                      size={13}
                      className={isActive ? 'text-accent' : 'text-faint'}
                    />
                    <span className="flex-1 truncate">{s.title}</span>
                    <button
                      type="button"
                      aria-label={`Close ${s.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(sid);
                      }}
                      className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              }),
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
