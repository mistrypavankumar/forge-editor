import { create } from 'zustand';

export type ClipboardMode = 'cut' | 'copy';

export interface ClipboardItem {
  path: string;
  name: string;
}

export interface FileClipboardState {
  item: ClipboardItem | null;
  mode: ClipboardMode | null;
  set: (item: ClipboardItem, mode: ClipboardMode) => void;
  clear: () => void;
}

export const useFileClipboard = create<FileClipboardState>((set) => ({
  item: null,
  mode: null,
  set: (item, mode) => set({ item, mode }),
  clear: () => set({ item: null, mode: null }),
}));
