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
export type SidebarSide = 'left' | 'right';

export interface LayoutState {
  sidebarVisible: boolean;
  rightVisible: boolean;
  bottomVisible: boolean;
  sidebarSide: SidebarSide;
  activity: ActivityId;
  rightTab: RightTab;
  bottomTab: BottomTab;
  settingsOpen: boolean;
  featuresOpen: boolean;
  togglePanel: (id: PanelId) => void;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
  setSidebarSide: (side: SidebarSide) => void;
  setActivity: (id: ActivityId) => void;
  setRightTab: (tab: RightTab) => void;
  setBottomTab: (tab: BottomTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setFeaturesOpen: (open: boolean) => void;
}

const visKey = (id: PanelId): 'sidebarVisible' | 'rightVisible' | 'bottomVisible' =>
  id === 'sidebar' ? 'sidebarVisible' : id === 'right' ? 'rightVisible' : 'bottomVisible';

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarVisible: true,
  rightVisible: false,
  bottomVisible: false,
  sidebarSide: 'left',
  activity: 'explorer',
  rightTab: 'assistant',
  bottomTab: 'terminal',
  settingsOpen: false,
  featuresOpen: false,
  togglePanel: (id) => set((s) => ({ [visKey(id)]: !s[visKey(id)] }) as Partial<LayoutState>),
  setPanelVisible: (id, visible) => set({ [visKey(id)]: visible } as Partial<LayoutState>),
  setSidebarSide: (side) => set({ sidebarSide: side }),
  setActivity: (id) => set({ activity: id }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setFeaturesOpen: (open) => set({ featuresOpen: open }),
}));
