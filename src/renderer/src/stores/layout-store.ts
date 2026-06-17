import { create } from 'zustand';

export type PanelId = 'sidebar' | 'right' | 'bottom';
export type ActivityId =
  | 'explorer'
  | 'search'
  | 'git'
  | 'run'
  | 'extensions'
  | 'database'
  | 'settings';
export type RightTab = 'assistant' | 'context' | 'changes';
export type BottomTab = 'terminal' | 'problems' | 'output' | 'tests' | 'debug';

export interface LayoutState {
  sidebarVisible: boolean;
  rightVisible: boolean;
  bottomVisible: boolean;
  activity: ActivityId;
  rightTab: RightTab;
  bottomTab: BottomTab;
  togglePanel: (id: PanelId) => void;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
  setActivity: (id: ActivityId) => void;
  setRightTab: (tab: RightTab) => void;
  setBottomTab: (tab: BottomTab) => void;
}

const visKey = (id: PanelId): 'sidebarVisible' | 'rightVisible' | 'bottomVisible' =>
  id === 'sidebar' ? 'sidebarVisible' : id === 'right' ? 'rightVisible' : 'bottomVisible';

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarVisible: true,
  rightVisible: false,
  bottomVisible: true,
  activity: 'explorer',
  rightTab: 'assistant',
  bottomTab: 'problems',
  togglePanel: (id) => set((s) => ({ [visKey(id)]: !s[visKey(id)] }) as Partial<LayoutState>),
  setPanelVisible: (id, visible) => set({ [visKey(id)]: visible } as Partial<LayoutState>),
  setActivity: (id) => set({ activity: id }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
}));
