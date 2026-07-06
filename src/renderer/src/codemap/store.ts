import { create } from 'zustand';
import type { CodeMap } from '@shared/ipc-contract';

/**
 * Renderer cache for the Codebase Map. The heavy analysis runs in the main process; this store just
 * holds the latest result plus loading/error state, and coalesces concurrent build requests (only
 * the newest wins). Views subscribe and re-render when the map lands.
 */
interface CodemapState {
  map: CodeMap | null;
  loading: boolean;
  error: string | null;
  /** Root the current `map` belongs to (so a folder switch invalidates it). */
  root: string | null;
  build: (rootPath: string, force?: boolean) => Promise<void>;
  clear: () => void;
}

let buildToken = 0;

export const useCodemapStore = create<CodemapState>((set, get) => ({
  map: null,
  loading: false,
  error: null,
  root: null,

  build: async (rootPath, force = false) => {
    if (get().loading && !force) return;
    const token = ++buildToken;
    set({ loading: true, error: null, root: rootPath });
    const res = await window.forge.codemapBuild(rootPath, force);
    if (token !== buildToken) return; // superseded by a newer build
    if (res.ok) set({ map: res.data, loading: false });
    else set({ error: res.error, loading: false });
  },

  clear: () => {
    buildToken += 1;
    set({ map: null, loading: false, error: null, root: null });
  },
}));
