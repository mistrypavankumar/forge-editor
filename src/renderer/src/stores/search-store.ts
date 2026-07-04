import { create } from 'zustand';
import type { SearchOptions } from '@shared/ipc-contract';

/** A live find/replace, shared from the Search panel so the editor can render its inline preview. */
export interface ReplacePreview {
  /** Match options (query + regex/case/whole-word flags). include/exclude are ignored here. */
  options: SearchOptions;
  /** The replacement string ($1/$& capture refs supported), non-empty when a preview is active. */
  replacement: string;
}

interface SearchState {
  /**
   * Non-null while a replace query is live in the Search panel. When set, the editor decorates
   * each match in the open file with the old text struck through + the replacement in green —
   * a preview of Replace All, before it touches disk. Null clears the decorations.
   */
  preview: ReplacePreview | null;
  setPreview: (preview: ReplacePreview | null) => void;
  /**
   * A query to seed the Search panel's input with, set when quick-open hands off a text search
   * ("Search '…' in files"). The panel consumes it once on mount/change, then clears it back to null.
   */
  seed: string | null;
  setSeed: (query: string | null) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
  seed: null,
  setSeed: (query) => set({ seed: query }),
}));
