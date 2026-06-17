import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  /** Read-only tabs (e.g. a staged "(Index)" view) can't be edited or saved. */
  readOnly?: boolean;
  /** Real on-disk path backing the tab; differs from `path` for synthetic views. */
  filePath?: string;
  /** When set, the tab renders as a side-by-side diff: `original` (left) vs `content` (right). */
  original?: string;
}

export interface RevealTarget {
  path: string;
  line: number;
  col: number;
}

export interface EditorState {
  tabs: OpenFile[];
  activePath: string | null;
  reveal: RevealTarget | null;
  autoSave: boolean;
  pendingRevert: { path: string; content: string } | null;
  mdPreview: boolean;
  openFile: (file: {
    path: string;
    name: string;
    content: string;
    readOnly?: boolean;
    filePath?: string;
    original?: string;
  }) => void;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  requestReveal: (target: RevealTarget) => void;
  consumeReveal: () => void;
  setAutoSave: (on: boolean) => void;
  toggleMdPreview: () => void;
  requestRevert: (path: string, content: string) => void;
  consumeRevert: () => void;
  renameTab: (oldPath: string, newPath: string, name: string) => void;
  closeOthers: (path: string) => void;
  closeToRight: (path: string) => void;
  closeSaved: () => void;
  closeAll: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activePath: null,
  reveal: null,
  autoSave: false,
  pendingRevert: null,
  mdPreview: false,
  openFile: (file) =>
    set((s) => {
      if (s.tabs.some((t) => t.path === file.path)) return { activePath: file.path };
      return { tabs: [...s.tabs, { ...file, dirty: false }], activePath: file.path };
    }),
  closeFile: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      if (idx === -1) return s;
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activePath = neighbor ? neighbor.path : null;
      }
      return { tabs, activePath };
    }),
  setActive: (path) => set({ activePath: path }),
  updateContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, dirty: true } : t)),
    })),
  markSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: false } : t)),
    })),
  requestReveal: (target) => set({ reveal: target }),
  consumeReveal: () => set({ reveal: null }),
  setAutoSave: (on) => set({ autoSave: on }),
  toggleMdPreview: () => set((s) => ({ mdPreview: !s.mdPreview })),
  requestRevert: (path, content) => set({ pendingRevert: { path, content } }),
  consumeRevert: () => set({ pendingRevert: null }),
  renameTab: (oldPath, newPath, name) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === oldPath ? { ...t, path: newPath, name, dirty: false } : t)),
      activePath: s.activePath === oldPath ? newPath : s.activePath,
    })),
  closeOthers: (path) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.path === path);
      return tab ? { tabs: [tab], activePath: path } : s;
    }),
  closeToRight: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      if (idx === -1) return s;
      const tabs = s.tabs.slice(0, idx + 1);
      const activePath = tabs.some((t) => t.path === s.activePath) ? s.activePath : path;
      return { tabs, activePath };
    }),
  closeSaved: () =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.dirty);
      const activePath = tabs.some((t) => t.path === s.activePath)
        ? s.activePath
        : (tabs[tabs.length - 1]?.path ?? null);
      return { tabs, activePath };
    }),
  closeAll: () => set({ tabs: [], activePath: null }),
}));
