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
export type BottomTab = 'terminal' | 'problems' | 'output' | 'tests' | 'debug' | 'browserDebug';
export type SidebarSide = 'left' | 'right';
/** Which view the right (assistant) panel shows: conversational Chat or the AI Agent workspace. */
export type RightMode = 'chat' | 'agent';

export interface LayoutState {
  sidebarVisible: boolean;
  rightVisible: boolean;
  bottomVisible: boolean;
  sidebarSide: SidebarSide;
  activity: ActivityId;
  bottomTab: BottomTab;
  /** Right-panel view mode (Chat vs Agent). */
  rightMode: RightMode;
  settingsOpen: boolean;
  featuresOpen: boolean;
  /** Folder names excluded from global file search (quick open), on top of .gitignore. */
  searchExclude: string[];
  /** Whether the built-in default excludes have been seeded into the user's list. */
  searchExcludeSeeded: boolean;
  /** Height (px) of the resizable commit-graph pane in the Source Control panel. */
  scmGraphHeight: number;
  togglePanel: (id: PanelId) => void;
  setPanelVisible: (id: PanelId, visible: boolean) => void;
  setSidebarSide: (side: SidebarSide) => void;
  setActivity: (id: ActivityId) => void;
  setBottomTab: (tab: BottomTab) => void;
  setRightMode: (mode: RightMode) => void;
  setSettingsOpen: (open: boolean) => void;
  setFeaturesOpen: (open: boolean) => void;
  setSearchExclude: (folders: string[]) => void;
  setSearchExcludeSeeded: (seeded: boolean) => void;
  setScmGraphHeight: (height: number) => void;
}

/** Default height (px) of the Source Control commit-graph pane. */
export const DEFAULT_SCM_GRAPH_HEIGHT = 300;

/**
 * Common build/cache folders excluded from global file search out of the box.
 * The baseline (node_modules, .git, dist, out) is always excluded by the file lister,
 * so these are the extra framework caches users most often want gone from quick-open.
 */
export const DEFAULT_SEARCH_EXCLUDE = [
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.parcel-cache',
  'coverage',
  'build',
  '.svelte-kit',
];

const visKey = (id: PanelId): 'sidebarVisible' | 'rightVisible' | 'bottomVisible' =>
  id === 'sidebar' ? 'sidebarVisible' : id === 'right' ? 'rightVisible' : 'bottomVisible';

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarVisible: true,
  rightVisible: false,
  bottomVisible: false,
  sidebarSide: 'left',
  activity: 'explorer',
  bottomTab: 'terminal',
  rightMode: 'chat',
  settingsOpen: false,
  featuresOpen: false,
  searchExclude: DEFAULT_SEARCH_EXCLUDE,
  searchExcludeSeeded: false,
  scmGraphHeight: DEFAULT_SCM_GRAPH_HEIGHT,
  togglePanel: (id) => set((s) => ({ [visKey(id)]: !s[visKey(id)] }) as Partial<LayoutState>),
  setPanelVisible: (id, visible) => set({ [visKey(id)]: visible } as Partial<LayoutState>),
  setSidebarSide: (side) => set({ sidebarSide: side }),
  setActivity: (id) => set({ activity: id }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  setRightMode: (mode) => set({ rightMode: mode }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setFeaturesOpen: (open) => set({ featuresOpen: open }),
  setSearchExclude: (folders) => set({ searchExclude: folders }),
  setSearchExcludeSeeded: (seeded) => set({ searchExcludeSeeded: seeded }),
  setScmGraphHeight: (height) => set({ scmGraphHeight: height }),
}));
