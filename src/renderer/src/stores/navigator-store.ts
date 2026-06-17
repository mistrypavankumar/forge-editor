import { create } from 'zustand';
import type { FilterChip } from '../data/project-map';

export type NavigatorTab = 'focus' | 'map' | 'recent' | 'structure';

export interface NavigatorState {
  tab: NavigatorTab;
  filter: FilterChip;
  setTab: (tab: NavigatorTab) => void;
  setFilter: (filter: FilterChip) => void;
}

export const useNavigatorStore = create<NavigatorState>((set) => ({
  tab: 'focus',
  filter: 'all',
  setTab: (tab) => set({ tab }),
  setFilter: (filter) => set({ filter }),
}));
