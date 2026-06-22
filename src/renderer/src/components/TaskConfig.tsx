import { X, Plus, Trash2 } from 'lucide-react';
import { useTasksStore, TASKS, defaultCommand } from '../stores/tasks-store';

export function TaskConfig({ onClose }: { onClose: () => void }): React.JSX.Element {
  const pm = useTasksStore((s) => s.pm);
  const overrides = useTasksStore((s) => s.overrides);
  const setOverride = useTasksStore((s) => s.setOverride);
  const custom = useTasksStore((s) => s.custom);
  const addCustom = useTasksStore((s) => s.addCustom);
  const updateCustom = useTasksStore((s) => s.updateCustom);
  const removeCustom = useTasksStore((s) => s.removeCustom);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[540px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
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

        <div className="flex flex-col gap-3 overflow-auto p-4">
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

          {custom.length > 0 ? (
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Custom
            </div>
          ) : null}
          {custom.map((c) => (
            <div key={c.id} className="flex items-end gap-2">
              <input
                value={c.label}
                placeholder="Label"
                onChange={(e) => updateCustom(c.id, { label: e.target.value })}
                className="w-28 shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
              />
              <input
                value={c.command}
                placeholder="command to run"
                onChange={(e) => updateCustom(c.id, { command: e.target.value })}
                className="flex-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
              />
              <button
                type="button"
                aria-label="Remove task"
                onClick={() => removeCustom(c.id)}
                className="flex h-[34px] w-8 shrink-0 items-center justify-center rounded-md text-faint hover:bg-surface-3 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addCustom}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-line py-1.5 text-[12px] text-muted hover:border-accent/40 hover:text-fg"
          >
            <Plus size={14} /> Add command
          </button>

          <p className="text-[11px] text-faint">
            Built-in commands fall back to the auto-detected default if left blank. Changes are saved
            automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
