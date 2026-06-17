import { Play } from 'lucide-react';
import { useTasksStore, runnableTasks } from '../stores/tasks-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useLayoutStore } from '../stores/layout-store';
import { runInTerminal } from '../lib/terminal-exec';
import { PanelHeader } from './ui/Panel';

export function RunPanel(): React.JSX.Element {
  const pm = useTasksStore((s) => s.pm);
  const overrides = useTasksStore((s) => s.overrides);
  const custom = useTasksStore((s) => s.custom);
  const tasks = runnableTasks(pm, overrides, custom);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);

  const run = (command: string): void => {
    setBottomTab('terminal');
    setPanelVisible('bottom', true);
    runInTerminal(activeSessionId, command);
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Run & Debug" />
      <div className="flex flex-col gap-1.5 p-2">
        {tasks.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => run(t.command)}
            className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent/40 hover:bg-surface-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent group-hover:bg-accent/15">
              <Play size={14} className="fill-current" />
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-medium text-fg">{t.label}</span>
              <span className="font-mono text-[11px] text-faint">{t.command}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
