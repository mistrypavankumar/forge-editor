import { create } from 'zustand';

export type MarkerSeverity = 'error' | 'warning' | 'info';

export interface MarkerInfo {
  id: string;
  severity: MarkerSeverity;
  message: string;
  path: string;
  file: string;
  line: number;
  col: number;
  code?: string;
}

export interface WorkbenchStatusState {
  cursor: { line: number; column: number };
  language: string;
  markers: MarkerInfo[];
  /** Git blame for the current line ("author (time ago)"), or null. Shown at the bottom-right. */
  blame: string | null;
  setCursor: (line: number, column: number) => void;
  setLanguage: (language: string) => void;
  setMarkers: (markers: MarkerInfo[]) => void;
  setBlame: (blame: string | null) => void;
}

export const useWorkbenchStatusStore = create<WorkbenchStatusState>((set) => ({
  cursor: { line: 1, column: 1 },
  language: 'plaintext',
  markers: [],
  blame: null,
  setCursor: (line, column) => set({ cursor: { line, column } }),
  setLanguage: (language) => set({ language }),
  setMarkers: (markers) => set({ markers }),
  setBlame: (blame) => set({ blame }),
}));

export function markerCounts(markers: MarkerInfo[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  return {
    errors: markers.filter((m) => m.severity === 'error').length,
    warnings: markers.filter((m) => m.severity === 'warning').length,
    infos: markers.filter((m) => m.severity === 'info').length,
  };
}
