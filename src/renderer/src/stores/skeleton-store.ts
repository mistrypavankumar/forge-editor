import { create } from 'zustand';
import type { GenerateSkeletonResult, SkeletonComponentInfo } from '@shared/skeleton';

/**
 * State for the "Generate Skeleton" modal. The command (see `commands/skeleton-commands.ts`) drives
 * this store: it opens the modal, detects components, and either shows a picker (multiple components)
 * or generates directly (single component). The `SkeletonPreview` component renders from this state.
 */

/** The file the modal is operating on — captured when the command runs so re-generation is stable. */
export interface SkeletonTarget {
  /** Editor tab / Monaco model key (used to apply an "Insert Below" edit to the live buffer). */
  path: string;
  /** Real on-disk path (used for extension detection and sibling-file naming). */
  filePath: string;
  fileName: string;
  code: string;
}

export type SkeletonPhase = 'detecting' | 'picking' | 'generating' | 'ready' | 'error';

interface SkeletonState {
  open: boolean;
  phase: SkeletonPhase;
  target: SkeletonTarget | null;
  /** Components found in the file — populated when the picker is shown. */
  candidates: SkeletonComponentInfo[];
  /** Currently selected component name (drives re-generation). */
  selected: string | null;
  result: GenerateSkeletonResult | null;
  error: string | null;
  /** True while an "Improve with AI" request is in flight (keeps the prior result visible). */
  aiBusy: boolean;
  /** Transient error from an AI generation that failed without discarding the current result. */
  aiError: string | null;

  openModal: (target: SkeletonTarget) => void;
  close: () => void;
  setPhase: (phase: SkeletonPhase) => void;
  showPicker: (candidates: SkeletonComponentInfo[]) => void;
  setResult: (selected: string, result: GenerateSkeletonResult) => void;
  setError: (message: string) => void;
  beginAi: () => void;
  endAiError: (message: string) => void;
}

export const useSkeletonStore = create<SkeletonState>((set) => ({
  open: false,
  phase: 'detecting',
  target: null,
  candidates: [],
  selected: null,
  result: null,
  error: null,
  aiBusy: false,
  aiError: null,

  openModal: (target) =>
    set({
      open: true, phase: 'detecting', target, candidates: [], selected: null,
      result: null, error: null, aiBusy: false, aiError: null,
    }),
  close: () => set({ open: false, target: null, result: null, error: null, candidates: [], aiBusy: false, aiError: null }),
  setPhase: (phase) => set({ phase }),
  showPicker: (candidates) => set({ phase: 'picking', candidates, aiError: null }),
  setResult: (selected, result) => set({ phase: 'ready', selected, result, error: null, aiBusy: false, aiError: null }),
  setError: (message) => set({ phase: 'error', error: message }),
  beginAi: () => set({ aiBusy: true, aiError: null }),
  endAiError: (message) => set({ aiBusy: false, aiError: message }),
}));
