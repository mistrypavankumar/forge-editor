/**
 * Pure drawing helpers for the annotation / screenshot-markup overlay. Kept free of React and DOM
 * lookups so the geometry is unit-testable with a mock 2D context.
 */

export type ShapeTool = 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text';

interface Base {
  color: string;
  /** Stroke width in px (also scales the text size and arrowhead). */
  width: number;
}

export interface PenShape extends Base {
  kind: 'pen';
  points: Array<{ x: number; y: number }>;
}
export interface RectShape extends Base {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface EllipseShape extends Base {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ArrowShape extends Base {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface TextShape extends Base {
  kind: 'text';
  x: number;
  y: number;
  text: string;
}

export type Shape = PenShape | RectShape | EllipseShape | ArrowShape | TextShape;

/** Font size derived from stroke width, so the text tool tracks the same weight control. */
export function textFontSize(width: number): number {
  return Math.round(12 + width * 4);
}

/** Draw a single annotation shape onto a 2D context. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (shape.kind) {
    case 'pen': {
      if (shape.points.length === 0) break;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      break;
    }
    case 'ellipse': {
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(shape.w) / 2, Math.abs(shape.h) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      drawArrow(ctx, shape);
      break;
    }
    case 'text': {
      const size = textFontSize(shape.width);
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(shape.text, shape.x, shape.y);
      break;
    }
  }
  ctx.restore();
}

/** Line with a filled triangular head at (x2,y2). */
function drawArrow(ctx: CanvasRenderingContext2D, a: ArrowShape): void {
  const { x1, y1, x2, y2 } = a;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, a.width * 4);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/** Redraw every shape (used for both the live canvas and export). */
export function drawAll(ctx: CanvasRenderingContext2D, shapes: Shape[]): void {
  for (const s of shapes) drawShape(ctx, s);
}

/**
 * Composite the frozen screenshot plus every annotation into one canvas at the natural pixel
 * dimensions of the capture. `shapes` are in the same on-screen coordinate space as the displayed
 * image, so they're scaled by (natural / displayed) before drawing.
 */
export function composite(
  image: CanvasImageSource,
  shapes: Shape[],
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight);
  const sx = displayWidth > 0 ? naturalWidth / displayWidth : 1;
  const sy = displayHeight > 0 ? naturalHeight / displayHeight : 1;
  ctx.scale(sx, sy);
  drawAll(ctx, shapes);
  return canvas;
}
