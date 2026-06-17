import { create } from 'zustand';
import type { RecentEntry } from '@shared/ipc-contract';

const MAX_RECENTS = 8;

export interface RecentsState {
  recents: RecentEntry[];
  addRecent: (entry: RecentEntry) => void;
  setRecents: (list: RecentEntry[]) => void;
}

export const useRecentsStore = create<RecentsState>((set) => ({
  recents: [],
  addRecent: (entry) =>
    set((s) => ({
      recents: [entry, ...s.recents.filter((r) => r.path !== entry.path)].slice(0, MAX_RECENTS),
    })),
  setRecents: (list) => set({ recents: list.slice(0, MAX_RECENTS) }),
}));
