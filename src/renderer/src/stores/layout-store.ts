import { create } from 'zustand';

export type PanelId = 'sidebar' | 'panel';

export interface LayoutState {
  sidebarVisible: boolean;
  panelVisible: boolean;
  togglePanel: (id: PanelId) => void;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
}

const key = (id: PanelId): keyof LayoutState =>
  id === 'sidebar' ? 'sidebarVisible' : 'panelVisible';

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarVisible: true,
  panelVisible: false,
  togglePanel: (id) => set((s) => ({ [key(id)]: !s[key(id)] }) as Partial<LayoutState>),
  setPanelVisible: (id, visible) => set({ [key(id)]: visible } as Partial<LayoutState>),
}));
