import { create } from 'zustand';

export type NavigatorTab = 'changes' | 'map' | 'recent' | 'structure';
export type FilterChip = 'all' | 'changed' | 'errors' | 'recent' | 'config' | 'tests';

export const filterChips: { id: FilterChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'changed', label: 'Changed' },
  { id: 'errors', label: 'Errors' },
  { id: 'recent', label: 'Recent' },
  { id: 'config', label: 'Config' },
  { id: 'tests', label: 'Tests' },
];

export interface NavigatorState {
  tab: NavigatorTab;
  filter: FilterChip;
  setTab: (tab: NavigatorTab) => void;
  setFilter: (filter: FilterChip) => void;
}

export const useNavigatorStore = create<NavigatorState>((set) => ({
  tab: 'structure',
  filter: 'all',
  setTab: (tab) => set({ tab }),
  setFilter: (filter) => set({ filter }),
}));
