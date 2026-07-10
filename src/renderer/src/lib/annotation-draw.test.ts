import { describe, expect, it, vi } from 'vitest';
import { drawAll, drawShape, textFontSize, type Shape } from './annotation-draw';

/** A 2D-context stand-in that records the ops each shape triggers. */
function fakeCtx() {
  const ops: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      ops.push(`${name}(${args.join(',')})`);
    };
  const ctx = {
    ops,
    save: rec('save'),
    restore: rec('restore'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: rec('closePath'),
    stroke: rec('stroke'),
    fill: rec('fill'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    ellipse: rec('ellipse'),
    fillText: rec('fillText'),
    scale: rec('scale'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
    font: '',
    textBaseline: '',
  };
  return ctx as unknown as CanvasRenderingContext2D & { ops: string[] };
}

describe('drawShape', () => {
  it('strokes a rectangle', () => {
    const ctx = fakeCtx();
    drawShape(ctx, { kind: 'rect', x: 1, y: 2, w: 3, h: 4, color: 'red', width: 2 });
    expect(ctx.ops).toContain('strokeRect(1,2,3,4)');
    expect(ctx.strokeStyle).toBe('red');
  });

  it('draws an ellipse centered in its bounds', () => {
    const ctx = fakeCtx();
    drawShape(ctx, { kind: 'ellipse', x: 0, y: 0, w: 20, h: 10, color: 'blue', width: 2 });
    // center (10,5), radii (10,5)
    expect(ctx.ops.some((o) => o.startsWith('ellipse(10,5,10,5'))).toBe(true);
  });

  it('draws a pen path through every point', () => {
    const ctx = fakeCtx();
    drawShape(ctx, {
      kind: 'pen',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
      color: '#fff',
      width: 3,
    });
    expect(ctx.ops).toContain('moveTo(0,0)');
    expect(ctx.ops.filter((o) => o.startsWith('lineTo')).length).toBe(2);
  });

  it('draws an arrow as a line plus a filled head', () => {
    const ctx = fakeCtx();
    drawShape(ctx, { kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 0, color: 'green', width: 2 });
    expect(ctx.ops).toContain('stroke()');
    expect(ctx.ops).toContain('fill()'); // the arrowhead
  });

  it('renders text with a size derived from stroke width', () => {
    const ctx = fakeCtx();
    drawShape(ctx, { kind: 'text', x: 4, y: 8, text: 'hi', color: 'red', width: 3 });
    expect(ctx.ops).toContain('fillText(hi,4,8)');
    expect(ctx.font).toContain(`${textFontSize(3)}px`);
  });
});

describe('drawAll', () => {
  it('draws each shape in order', () => {
    const ctx = fakeCtx();
    const shapes: Shape[] = [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'red', width: 1 },
      { kind: 'text', x: 0, y: 0, text: 'x', color: 'red', width: 1 },
    ];
    const spy = vi.spyOn(ctx, 'save');
    drawAll(ctx, shapes);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
