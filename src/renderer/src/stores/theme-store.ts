import { create } from 'zustand';

/** Default base background opacity when glass is enabled (matches the tuned design). */
export const DEFAULT_GLASS_OPACITY = 0.3;

export interface ThemeState {
  currentId: string;
  /** Editor syntax scheme id ('auto' follows the interface theme). See EDITOR_SCHEMES. */
  editorScheme: string;
  /** Frosted-glass transparency on/off. When off the UI is fully opaque. */
  glass: boolean;
  /** Base background opacity (0.1–1) when glass is on; lower = more see-through. */
  glassOpacity: number;
  setTheme: (id: string) => void;
  setEditorScheme: (id: string) => void;
  setGlass: (on: boolean) => void;
  setGlassOpacity: (v: number) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentId: 'forge-dark',
  editorScheme: 'auto',
  glass: true,
  glassOpacity: DEFAULT_GLASS_OPACITY,
  setTheme: (id) => set({ currentId: id }),
  setEditorScheme: (id) => set({ editorScheme: id }),
  setGlass: (on) => set({ glass: on }),
  // Clamp to the supported range so a stray stored value can't make the UI invisible.
  setGlassOpacity: (v) => set({ glassOpacity: Math.min(1, Math.max(0.1, v)) }),
}));
