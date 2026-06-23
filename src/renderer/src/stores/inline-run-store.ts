import { create } from 'zustand';
import type { InlineRunLog } from '@shared/ipc-contract';

export interface InlineRunFileState {
  logs: InlineRunLog[];
  timedOut: boolean;
  error: string | null;
  running: boolean;
}

const EMPTY: InlineRunFileState = { logs: [], timedOut: false, error: null, running: false };

export interface InlineRunState {
  /** Master switch for the live "console.log next to the line" feature. */
  enabled: boolean;
  /** Per-file run state, keyed by the model URI path (matches editor model paths). */
  byPath: Record<string, InlineRunFileState>;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
  setRunning: (path: string, running: boolean) => void;
  setResult: (path: string, logs: InlineRunLog[], timedOut: boolean) => void;
  setError: (path: string, error: string) => void;
  clear: (path: string) => void;
  get: (path: string) => InlineRunFileState;
}

export const useInlineRunStore = create<InlineRunState>((set, getState) => ({
  enabled: false,
  byPath: {},
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  setEnabled: (enabled) => set({ enabled }),
  setRunning: (path, running) =>
    set((s) => ({ byPath: { ...s.byPath, [path]: { ...(s.byPath[path] ?? EMPTY), running } } })),
  setResult: (path, logs, timedOut) =>
    set((s) => ({
      byPath: { ...s.byPath, [path]: { logs, timedOut, error: null, running: false } },
    })),
  setError: (path, error) =>
    set((s) => ({
      byPath: { ...s.byPath, [path]: { ...(s.byPath[path] ?? EMPTY), error, running: false } },
    })),
  clear: (path) =>
    set((s) => {
      if (!s.byPath[path]) return s;
      const next = { ...s.byPath };
      delete next[path];
      return { byPath: next };
    }),
  get: (path) => getState().byPath[path] ?? EMPTY,
}));
