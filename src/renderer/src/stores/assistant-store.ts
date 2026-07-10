import { create } from 'zustand';

/**
 * A prompt handed to the Assistant chat from elsewhere in the app (e.g. "Ask AI to Fix" in the
 * Browser Debug panel). The AssistantPanel consumes a non-null seed once, runs it as a chat turn,
 * and clears it — mirroring the Search panel's `setSeed` hand-off pattern.
 */
export interface AssistantSeed {
  /** Short text shown as the user's chat bubble. */
  displayText: string;
  /** The full instruction + context sent to the model. */
  promptText: string;
  /**
   * File to attach as context. `undefined` → use the active editor tab (default chat behavior);
   * `null` → send no file; an object → attach that specific file.
   */
  file?: { name: string; language: string; content: string } | null;
}

interface AssistantSeedState {
  seed: AssistantSeed | null;
  setSeed: (seed: AssistantSeed | null) => void;
}

export const useAssistantStore = create<AssistantSeedState>((set) => ({
  seed: null,
  setSeed: (seed) => set({ seed }),
}));
