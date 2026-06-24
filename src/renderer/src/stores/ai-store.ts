import { create } from 'zustand';
import type { AiProvider } from '@shared/ipc-contract';

interface AiState {
  /** Selected AI provider (default: the local `claude` CLI). */
  provider: AiProvider;
  /** Optional model override; empty string means "use the provider's default model". */
  model: string;
  setProvider: (provider: AiProvider) => void;
  setModel: (model: string) => void;
}

export const useAiStore = create<AiState>((set) => ({
  provider: 'claude-cli',
  model: '',
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
}));
