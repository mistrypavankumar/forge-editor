import { X } from 'lucide-react';
import { useTasksStore, TASKS, defaultCommand } from '../stores/tasks-store';

export function TaskConfig({ onClose }: { onClose: () => void }): React.JSX.Element {
  const pm = useTasksStore((s) => s.pm);
  const overrides = useTasksStore((s) => s.overrides);
  const setOverride = useTasksStore((s) => s.setOverride);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh]"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">Task commands</h2>
            <p className="mt-0.5 text-[11px] text-faint">
              Detected package manager: <span className="text-accent">{pm}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {TASKS.map((t) => (
            <label key={t.id} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                {t.label}
              </span>
              <input
                value={overrides[t.id] ?? ''}
                placeholder={defaultCommand(pm, t.id)}
                onChange={(e) => setOverride(t.id, e.target.value || null)}
                className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
              />
            </label>
          ))}
          <p className="text-[11px] text-faint">
            Leave blank to use the auto-detected default. Changes are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
