import { Play, Loader2 } from 'lucide-react';
import { useTasksStore, runnableTasks } from '../stores/tasks-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useLayoutStore } from '../stores/layout-store';
import { runInTerminal } from '../lib/terminal-exec';
import { PanelHeader } from './ui/Panel';
import { cn } from '../lib/cn';

export function RunPanel(): React.JSX.Element {
  const pm = useTasksStore((s) => s.pm);
  const overrides = useTasksStore((s) => s.overrides);
  const custom = useTasksStore((s) => s.custom);
  const tasks = runnableTasks(pm, overrides, custom);
  const newTerminal = useTerminalStore((s) => s.newTerminal);
  const sessions = useTerminalStore((s) => s.sessions);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);

  // How many open terminals each task currently has — drives the running indicator.
  const runCounts = new Map<string, number>();
  for (const s of Object.values(sessions)) {
    if (s.taskKey) runCounts.set(s.taskKey, (runCounts.get(s.taskKey) ?? 0) + 1);
  }

  // Each task runs in its own fresh terminal, titled after and tagged with the task.
  const run = (key: string, label: string, command: string): void => {
    setBottomTab('terminal');
    setPanelVisible('bottom', true);
    const id = newTerminal(label, key);
    runInTerminal(id, command);
  };

  return (
    <div className="flex flex-col">
      <PanelHeader title="Tasks" />
      <div className="flex flex-col gap-1.5 p-2">
        {tasks.map((t) => {
          const count = runCounts.get(t.key) ?? 0;
          const running = count > 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => run(t.key, t.label, t.command)}
              className={cn(
                'group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                running
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-line bg-surface hover:border-accent/40 hover:bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-accent',
                  running ? 'bg-accent/20' : 'bg-surface-2 group-hover:bg-accent/15',
                )}
              >
                {running ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} className="fill-current" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  {t.label}
                  {running ? (
                    <span className="rounded-full bg-accent/20 px-1.5 text-[10px] font-normal text-accent">
                      running{count > 1 ? ` ×${count}` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="truncate font-mono text-[11px] text-faint">{t.command}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
