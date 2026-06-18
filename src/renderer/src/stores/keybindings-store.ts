import { create } from 'zustand';

export interface KeybindingsState {
  /** User overrides: keystroke → command id (merged over defaults). */
  overrides: Record<string, string>;
  setOverride: (keystroke: string, commandId: string) => void;
  removeOverride: (keystroke: string) => void;
  setOverrides: (overrides: Record<string, string>) => void;
}

export const useKeybindingsStore = create<KeybindingsState>((set) => ({
  overrides: {},
  setOverride: (keystroke, commandId) =>
    set((s) => ({ overrides: { ...s.overrides, [keystroke]: commandId } })),
  removeOverride: (keystroke) =>
    set((s) => {
      const overrides = { ...s.overrides };
      delete overrides[keystroke];
      return { overrides };
    }),
  setOverrides: (overrides) => set({ overrides }),
}));
