import { create } from 'zustand';

export type TaskId = 'dev' | 'test' | 'build' | 'lint';

export const TASKS: { id: TaskId; label: string }[] = [
  { id: 'dev', label: 'Dev' },
  { id: 'test', label: 'Test' },
  { id: 'build', label: 'Build' },
  { id: 'lint', label: 'Lint' },
];

export interface TasksState {
  pm: string;
  overrides: Partial<Record<TaskId, string>>;
  setPm: (pm: string) => void;
  setOverride: (id: TaskId, command: string | null) => void;
  setOverrides: (overrides: Partial<Record<TaskId, string>>) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  pm: 'npm',
  overrides: {},
  setPm: (pm) => set({ pm }),
  setOverride: (id, command) =>
    set((s) => {
      const overrides = { ...s.overrides };
      // Store raw text (don't trim — that would eat spaces in a controlled input).
      if (command === null || command === '') delete overrides[id];
      else overrides[id] = command;
      return { overrides };
    }),
  setOverrides: (overrides) => set({ overrides }),
}));

/** Auto default for a task: "<pm> run <id>" unless the user overrode it. */
export function defaultCommand(pm: string, id: TaskId): string {
  return `${pm} run ${id}`;
}

export function commandFor(pm: string, overrides: Partial<Record<TaskId, string>>, id: TaskId): string {
  return overrides[id] ?? defaultCommand(pm, id);
}
