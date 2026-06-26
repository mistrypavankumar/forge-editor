import { create } from 'zustand';
import type { AiProvider } from '@shared/ipc-contract';

interface AiState {
  /** Selected AI provider (default: the local `claude` CLI). */
  provider: AiProvider;
  /** Optional model override; empty string means "use the provider's default model". */
  model: string;
  /** Inline ghost-text completions in the editor are enabled. */
  inlineSuggest: boolean;
  setProvider: (provider: AiProvider) => void;
  setModel: (model: string) => void;
  setInlineSuggest: (on: boolean) => void;
  toggleInlineSuggest: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  provider: 'claude-cli',
  model: '',
  inlineSuggest: false,
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setInlineSuggest: (on) => set({ inlineSuggest: on }),
  toggleInlineSuggest: () => set((s) => ({ inlineSuggest: !s.inlineSuggest })),
}));
