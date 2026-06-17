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
}));
