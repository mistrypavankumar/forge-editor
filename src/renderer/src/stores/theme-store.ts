import { create } from 'zustand';

export interface ThemeState {
  currentId: string;
  setTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentId: 'forge-dark',
  setTheme: (id) => set({ currentId: id }),
}));
