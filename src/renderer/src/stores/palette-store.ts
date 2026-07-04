import { create } from 'zustand';

export type PaletteMode = 'commands' | 'files';

export interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  /** Query the input is seeded with when the palette opens (e.g. a file name cmd-clicked in the terminal). */
  initialQuery: string;
  openPalette: (mode: PaletteMode, query?: string) => void;
  close: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  mode: 'commands',
  initialQuery: '',
  openPalette: (mode, query = '') => set({ open: true, mode, initialQuery: query }),
  close: () => set({ open: false }),
}));
