import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
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
  openFile: (file: { path: string; name: string; content: string }) => void;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  requestReveal: (target: RevealTarget) => void;
  consumeReveal: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activePath: null,
  reveal: null,
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
}));
