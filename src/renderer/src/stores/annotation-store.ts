import { create } from 'zustand';
import type { Shape, ShapeTool } from '../lib/annotation-draw';

/** Default markup palette (matches the toolbar swatches). */
export const ANNOTATION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // violet
  '#ffffff', // white
];

/** Stroke widths offered by the three-dot size picker. */
export const ANNOTATION_WIDTHS = [2, 4, 7];

/** On-screen rectangle where the frozen capture is displayed (viewport coordinates). */
export interface CaptureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnnotationState {
  /** True while the markup overlay is showing. */
  active: boolean;
  /** Frozen screenshot of the editor pane as a PNG data URL. */
  image: string | null;
  /** Natural pixel size of the captured image (for a crisp export). */
  naturalWidth: number;
  naturalHeight: number;
  /** Where to place/size the image on screen (matches the editor pane it was captured from). */
  rect: CaptureRect | null;

  tool: ShapeTool;
  color: string;
  width: number;
  /** Temporarily hide the drawn annotations without discarding them. */
  hidden: boolean;
  /** Draw history; undo pops the last entry. */
  shapes: Shape[];

  begin: (opts: {
    image: string;
    rect: CaptureRect;
    naturalWidth: number;
    naturalHeight: number;
  }) => void;
  close: () => void;
  setTool: (t: ShapeTool) => void;
  setColor: (c: string) => void;
  setWidth: (w: number) => void;
  toggleHidden: () => void;
  addShape: (s: Shape) => void;
  undo: () => void;
  clear: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  active: false,
  image: null,
  naturalWidth: 0,
  naturalHeight: 0,
  rect: null,

  tool: 'arrow',
  color: ANNOTATION_COLORS[0],
  width: ANNOTATION_WIDTHS[1],
  hidden: false,
  shapes: [],

  begin: ({ image, rect, naturalWidth, naturalHeight }) =>
    set({
      active: true,
      image,
      rect,
      naturalWidth,
      naturalHeight,
      shapes: [],
      hidden: false,
    }),
  close: () =>
    set({ active: false, image: null, rect: null, shapes: [], hidden: false }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
  addShape: (shape) => set((s) => ({ shapes: [...s.shapes, shape] })),
  undo: () => set((s) => ({ shapes: s.shapes.slice(0, -1) })),
  clear: () => set({ shapes: [] }),
}));
