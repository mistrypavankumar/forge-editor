import { create } from 'zustand';
import type { ProjectDiagnostic } from '@shared/ipc-contract';
import { useWorkspaceStore } from './workspace-store';

export interface DiagnosticsState {
  diagnostics: ProjectDiagnostic[];
  running: boolean;
  /** Whether a project-wide check has completed at least once. */
  hasRun: boolean;
  error: string | null;
  run: () => Promise<void>;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  diagnostics: [],
  running: false,
  hasRun: false,
  error: null,
  run: async () => {
    const rootPath = useWorkspaceStore.getState().rootPath;
    if (!rootPath || get().running) return;
    set({ running: true, error: null });
    const res = await window.forge.runDiagnostics(rootPath);
    if (res.ok) {
      set({ diagnostics: res.data, running: false, hasRun: true });
    } else {
      set({ running: false, hasRun: true, error: res.error });
    }
  },
}));
