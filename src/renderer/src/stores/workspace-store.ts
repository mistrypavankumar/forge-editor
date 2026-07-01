import { create } from 'zustand';
import type { DirEntry } from '@shared/ipc-contract';

export interface WorkspaceState {
  rootPath: string | null;
  rootEntries: DirEntry[];
  childrenByPath: Record<string, DirEntry[]>;
  expandedPaths: Record<string, boolean>;
  scopedPath: string | null;
  branch: string | null;
  renamingPath: string | null;
  selectedDir: string | null;
  creating: { dir: string; kind: 'file' | 'folder' } | null;
  syncTick: number;
  changeCount: number;
  /** Local commits not yet pushed to the current branch's upstream. */
  ahead: number;
  /** Upstream commits not yet pulled into the current branch. */
  behind: number;
  /** False when the current branch has no upstream (nothing to compare push/pull against). */
  hasUpstream: boolean;
  /** Commits the current branch is behind the default branch on the remote (needs a rebase). */
  baseBehind: number;
  /** The default-branch remote ref `baseBehind` is measured against (e.g. "origin/dev"), or null. */
  base: string | null;
  setWorkspace: (rootPath: string, entries: DirEntry[]) => void;
  setRootEntries: (entries: DirEntry[]) => void;
  setChildren: (path: string, entries: DirEntry[]) => void;
  toggleExpanded: (path: string) => void;
  setScope: (path: string | null) => void;
  setBranch: (branch: string | null) => void;
  setRenaming: (path: string | null) => void;
  setSelectedDir: (dir: string | null) => void;
  expandPath: (path: string) => void;
  startCreating: (dir: string, kind: 'file' | 'folder') => void;
  cancelCreating: () => void;
  collapseAll: () => void;
  bumpSync: () => void;
  setChangeCount: (n: number) => void;
  setAheadBehind: (
    ahead: number,
    behind: number,
    hasUpstream: boolean,
    baseBehind: number,
    base: string | null,
  ) => void;
  closeWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  rootPath: null,
  rootEntries: [],
  childrenByPath: {},
  expandedPaths: {},
  scopedPath: null,
  branch: null,
  renamingPath: null,
  selectedDir: null,
  creating: null,
  syncTick: 0,
  changeCount: 0,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  baseBehind: 0,
  base: null,
  setWorkspace: (rootPath, entries) =>
    set({
      rootPath,
      rootEntries: entries,
      childrenByPath: {},
      expandedPaths: {},
      scopedPath: null,
      branch: null,
      renamingPath: null,
      selectedDir: null,
      creating: null,
      ahead: 0,
      behind: 0,
      hasUpstream: false,
      baseBehind: 0,
      base: null,
    }),
  setRootEntries: (entries) => set({ rootEntries: entries }),
  setChildren: (path, entries) =>
    set((s) => ({ childrenByPath: { ...s.childrenByPath, [path]: entries } })),
  toggleExpanded: (path) =>
    set((s) => ({ expandedPaths: { ...s.expandedPaths, [path]: !s.expandedPaths[path] } })),
  setScope: (path) => set({ scopedPath: path }),
  setBranch: (branch) => set({ branch }),
  setRenaming: (path) => set({ renamingPath: path }),
  setSelectedDir: (dir) => set({ selectedDir: dir }),
  expandPath: (path) =>
    set((s) => ({ expandedPaths: { ...s.expandedPaths, [path]: true } })),
  startCreating: (dir, kind) => set({ creating: { dir, kind } }),
  cancelCreating: () => set({ creating: null }),
  collapseAll: () => set({ expandedPaths: {} }),
  bumpSync: () => set((s) => ({ syncTick: s.syncTick + 1 })),
  setChangeCount: (n) => set({ changeCount: n }),
  setAheadBehind: (ahead, behind, hasUpstream, baseBehind, base) =>
    set({ ahead, behind, hasUpstream, baseBehind, base }),
  closeWorkspace: () =>
    set({
      rootPath: null,
      rootEntries: [],
      childrenByPath: {},
      expandedPaths: {},
      scopedPath: null,
      branch: null,
      selectedDir: null,
      changeCount: 0,
      ahead: 0,
      behind: 0,
      hasUpstream: false,
      baseBehind: 0,
      base: null,
    }),
}));
