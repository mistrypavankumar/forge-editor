import { create } from 'zustand';
import type { FormatterId } from '../lib/detect-formatters';

export interface FormatterState {
  selectedId: FormatterId;
  /** Formatters available in the current project (ESLint plus any detected). */
  available: FormatterId[];
  formatOnSave: boolean;
  /** Auto-format the active file 5s after edits stop. */
  autoFormat: boolean;
  /** Last formatter error (missing binary, non-zero exit), shown in the status bar. */
  lastError: string | null;
  setSelected: (id: FormatterId) => void;
  setAvailable: (ids: FormatterId[]) => void;
  setFormatOnSave: (on: boolean) => void;
  setAutoFormat: (on: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFormatterStore = create<FormatterState>((set) => ({
  selectedId: 'eslint',
  available: ['eslint'],
  formatOnSave: false,
  autoFormat: false,
  lastError: null,
  setSelected: (id) => set({ selectedId: id }),
  setAvailable: (ids) =>
    set((s) => ({
      available: ids,
      // Keep the selection valid; fall back to the default if it's no longer available.
      selectedId: ids.includes(s.selectedId) ? s.selectedId : (ids[0] ?? 'eslint'),
    })),
  setFormatOnSave: (on) => set({ formatOnSave: on }),
  setAutoFormat: (on) => set({ autoFormat: on }),
  setError: (error) => set({ lastError: error }),
}));
