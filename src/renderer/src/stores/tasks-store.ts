import { create } from 'zustand';

export type TaskId = 'dev' | 'test' | 'build' | 'lint';

export const TASKS: { id: TaskId; label: string }[] = [
  { id: 'dev', label: 'Dev' },
  { id: 'test', label: 'Test' },
  { id: 'build', label: 'Build' },
  { id: 'lint', label: 'Lint' },
];

export interface CustomTask {
  id: string;
  label: string;
  command: string;
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `custom-${seq}-${seq * 7 + 13}`;
}

export interface TasksState {
  pm: string;
  overrides: Partial<Record<TaskId, string>>;
  custom: CustomTask[];
  setPm: (pm: string) => void;
  setOverride: (id: TaskId, command: string | null) => void;
  setOverrides: (overrides: Partial<Record<TaskId, string>>) => void;
  addCustom: () => void;
  updateCustom: (id: string, patch: Partial<Pick<CustomTask, 'label' | 'command'>>) => void;
  removeCustom: (id: string) => void;
  setCustom: (custom: CustomTask[]) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  pm: 'npm',
  overrides: {},
  custom: [],
  setPm: (pm) => set({ pm }),
  setOverride: (id, command) =>
    set((s) => {
      const overrides = { ...s.overrides };
      if (command === null || command === '') delete overrides[id];
      else overrides[id] = command;
      return { overrides };
    }),
  setOverrides: (overrides) => set({ overrides }),
  addCustom: () =>
    set((s) => {
      // Guarantee a fresh id even when `seq` was reset on reload but persisted tasks survive,
      // otherwise duplicate ids collide on the React key and the new row mirrors an old one.
      const taken = new Set(s.custom.map((c) => c.id));
      let id = newId();
      while (taken.has(id)) id = newId();
      return { custom: [...s.custom, { id, label: '', command: '' }] };
    }),
  updateCustom: (id, patch) =>
    set((s) => ({ custom: s.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  removeCustom: (id) => set((s) => ({ custom: s.custom.filter((c) => c.id !== id) })),
  setCustom: (custom) => {
    // Advance the id counter past any restored ids so future adds never reuse one.
    for (const c of custom) {
      const m = /^custom-(\d+)-/.exec(c.id);
      if (m) seq = Math.max(seq, Number(m[1]));
    }
    set({ custom });
  },
}));

export function defaultCommand(pm: string, id: TaskId): string {
  return `${pm} run ${id}`;
}

export function commandFor(pm: string, overrides: Partial<Record<TaskId, string>>, id: TaskId): string {
  return overrides[id] ?? defaultCommand(pm, id);
}

export interface RunnableTask {
  key: string;
  label: string;
  command: string;
}

/** Built-in tasks + any custom tasks that have a command. */
export function runnableTasks(
  pm: string,
  overrides: Partial<Record<TaskId, string>>,
  custom: CustomTask[],
): RunnableTask[] {
  const builtin = TASKS.map((t) => ({ key: t.id, label: t.label, command: commandFor(pm, overrides, t.id) }));
  const extra = custom
    .filter((c) => c.command.trim())
    .map((c) => ({ key: c.id, label: c.label.trim() || 'Task', command: c.command }));
  return [...builtin, ...extra];
}
