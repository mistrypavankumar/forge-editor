import { create } from 'zustand';

export type PaletteMode = 'commands' | 'files';

export interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  openPalette: (mode: PaletteMode) => void;
  close: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  mode: 'commands',
  openPalette: (mode) => set({ open: true, mode }),
  close: () => set({ open: false }),
}));
