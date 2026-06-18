import { useEffect } from 'react';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useWorkspaceStore } from '../stores/workspace-store';

/** Delay after changes settle before re-running the project check. */
export const AUTO_DIAGNOSTICS_DELAY_MS = 2000;

/**
 * When "auto-check problems" is on, run a project-wide diagnostics check shortly after the
 * workspace opens and after on-disk changes settle (saves, git ops). Debounced and guarded
 * against overlapping runs in the store, since a full `tsc` pass is expensive.
 */
export function useAutoDiagnostics(): void {
  const autoRun = useDiagnosticsStore((s) => s.autoRun);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const syncTick = useWorkspaceStore((s) => s.syncTick);

  useEffect(() => {
    if (!autoRun || !rootPath) return;
    const id = setTimeout(() => void useDiagnosticsStore.getState().run(), AUTO_DIAGNOSTICS_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoRun, rootPath, syncTick]);
}
