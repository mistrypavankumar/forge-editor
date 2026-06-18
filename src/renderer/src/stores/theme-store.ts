import { create } from 'zustand';

export interface ThemeState {
  currentId: string;
  /** Editor syntax scheme id ('auto' follows the interface theme). See EDITOR_SCHEMES. */
  editorScheme: string;
  setTheme: (id: string) => void;
  setEditorScheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentId: 'forge-dark',
  editorScheme: 'auto',
  setTheme: (id) => set({ currentId: id }),
  setEditorScheme: (id) => set({ editorScheme: id }),
}));
