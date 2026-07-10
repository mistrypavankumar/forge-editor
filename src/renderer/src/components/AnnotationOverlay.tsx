import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Pencil,
  Square,
  Circle,
  ArrowUpRight,
  Type,
  Eye,
  EyeOff,
  Undo2,
  Trash2,
  Camera,
  Check,
  X,
} from 'lucide-react';
import {
  ANNOTATION_COLORS,
  ANNOTATION_WIDTHS,
  useAnnotationStore,
} from '../stores/annotation-store';
import type { ShapeTool, Shape } from '../lib/annotation-draw';
import { drawAll, drawShape, textFontSize } from '../lib/annotation-draw';
import { copyAnnotationToClipboard } from '../lib/annotation-actions';
import { cn } from '../lib/cn';

const TOOLS: Array<{ tool: ShapeTool; icon: typeof Pencil; label: string }> = [
  { tool: 'pen', icon: Pencil, label: 'Draw' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'ellipse', icon: Circle, label: 'Ellipse' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { tool: 'text', icon: Type, label: 'Text' },
];

/** Text entry currently being typed (in canvas/display coordinates). */
interface TextDraft {
  x: number;
  y: number;
  value: string;
}

export function AnnotationOverlay(): React.JSX.Element | null {
  const active = useAnnotationStore((s) => s.active);
  const image = useAnnotationStore((s) => s.image);
  const rect = useAnnotationStore((s) => s.rect);
  const shapes = useAnnotationStore((s) => s.shapes);
  const hidden = useAnnotationStore((s) => s.hidden);
  const tool = useAnnotationStore((s) => s.tool);
  const color = useAnnotationStore((s) => s.color);
  const width = useAnnotationStore((s) => s.width);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The in-progress shape, drawn on top of the committed ones but not yet in the store.
  const draftRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => {
    draftRef.current = null;
    setTextDraft(null);
    useAnnotationStore.getState().close();
  }, []);

  // Redraw the whole canvas from the committed shapes plus any live draft.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hidden) return;
    drawAll(ctx, shapes);
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }, [shapes, hidden]);

  useEffect(() => {
    redraw();
  }, [redraw, rect]);

  // Esc closes the markup surface.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // If typing a text label, Esc just cancels that; otherwise close the overlay.
        if (textDraft) setTextDraft(null);
        else close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, textDraft, close]);

  if (!active || !image || !rect) return null;

  const pointFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    const box = canvas?.getBoundingClientRect();
    return {
      x: e.clientX - (box?.left ?? 0),
      y: e.clientY - (box?.top ?? 0),
    };
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    const p = pointFromEvent(e);
    if (tool === 'text') {
      setTextDraft({ x: p.x, y: p.y, value: '' });
      return;
    }
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (tool === 'pen') {
      draftRef.current = { kind: 'pen', points: [p], color, width };
    } else if (tool === 'arrow') {
      draftRef.current = { kind: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width };
    } else {
      draftRef.current = { kind: tool, x: p.x, y: p.y, w: 0, h: 0, color, width };
    }
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drawingRef.current || !draftRef.current) return;
    const p = pointFromEvent(e);
    const d = draftRef.current;
    if (d.kind === 'pen') {
      d.points.push(p);
    } else if (d.kind === 'arrow') {
      d.x2 = p.x;
      d.y2 = p.y;
    } else if (d.kind === 'rect' || d.kind === 'ellipse') {
      d.w = p.x - d.x;
      d.h = p.y - d.y;
    }
    redraw();
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    const d = draftRef.current;
    draftRef.current = null;
    if (d && !isDegenerate(d)) useAnnotationStore.getState().addShape(d);
    else redraw();
  };

  const commitText = (): void => {
    if (textDraft && textDraft.value.trim()) {
      useAnnotationStore.getState().addShape({
        kind: 'text',
        x: textDraft.x,
        y: textDraft.y,
        text: textDraft.value,
        color,
        width,
      });
    }
    setTextDraft(null);
  };

  const onCopy = async (): Promise<void> => {
    const ok = await copyAnnotationToClipboard();
    if (ok) {
      setCopied(true);
      setTimeout(close, 550);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[4000] bg-bg/80 backdrop-blur-sm">
      {/* Frozen screenshot + drawing canvas, positioned over the editor pane it came from. */}
      <img
        src={image}
        alt="Editor screenshot"
        draggable={false}
        className="pointer-events-none absolute select-none rounded-md shadow-2xl ring-1 ring-line"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
      <canvas
        ref={canvasRef}
        width={rect.width}
        height={rect.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          cursor: tool === 'text' ? 'text' : 'crosshair',
        }}
      />

      {/* In-progress text label. */}
      {textDraft ? (
        <input
          autoFocus
          value={textDraft.value}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            e.stopPropagation();
          }}
          className="absolute z-10 border-none bg-transparent p-0 font-semibold outline-none"
          style={{
            left: rect.left + textDraft.x,
            top: rect.top + textDraft.y,
            color,
            fontSize: textFontSize(width),
            fontFamily: 'Inter, system-ui, sans-serif',
            minWidth: 40,
          }}
        />
      ) : null}

      <Toolbar onCopy={onCopy} onClose={close} copied={copied} />
    </div>,
    document.body,
  );
}

/** A drag that never moved (a stray click) shouldn't leave an invisible zero-size shape. */
function isDegenerate(s: Shape): boolean {
  if (s.kind === 'pen') return s.points.length < 2;
  if (s.kind === 'arrow') return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3;
  if (s.kind === 'rect' || s.kind === 'ellipse') return Math.abs(s.w) < 3 && Math.abs(s.h) < 3;
  return false;
}

function Toolbar({
  onCopy,
  onClose,
  copied,
}: {
  onCopy: () => void;
  onClose: () => void;
  copied: boolean;
}): React.JSX.Element {
  const tool = useAnnotationStore((s) => s.tool);
  const color = useAnnotationStore((s) => s.color);
  const width = useAnnotationStore((s) => s.width);
  const hidden = useAnnotationStore((s) => s.hidden);
  const canUndo = useAnnotationStore((s) => s.shapes.length > 0);
  const store = useAnnotationStore.getState;

  return (
    <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-surface-2/95 px-2 py-1.5 text-muted shadow-2xl backdrop-blur">
      {/* Tools */}
      {TOOLS.map(({ tool: t, icon: Icon, label }) => (
        <button
          key={t}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => store().setTool(t)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-fg',
            tool === t && 'bg-surface-3 text-fg',
          )}
        >
          <Icon size={16} />
        </button>
      ))}

      <Divider />

      {/* Colors */}
      {ANNOTATION_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => store().setColor(c)}
          className={cn(
            'h-5 w-5 rounded-full border border-black/20 transition-transform hover:scale-110',
            color === c && 'ring-2 ring-fg ring-offset-1 ring-offset-surface-2',
          )}
          style={{ backgroundColor: c }}
        />
      ))}

      <Divider />

      {/* Stroke widths */}
      {ANNOTATION_WIDTHS.map((w, i) => (
        <button
          key={w}
          type="button"
          title={['Thin', 'Medium', 'Thick'][i]}
          aria-label={`Stroke ${w}`}
          onClick={() => store().setWidth(w)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3',
            width === w && 'bg-surface-3',
          )}
        >
          <span
            className={cn('rounded-full', width === w ? 'bg-fg' : 'bg-muted')}
            style={{ width: 4 + i * 3, height: 4 + i * 3 }}
          />
        </button>
      ))}

      <Divider />

      {/* Actions */}
      <button
        type="button"
        title={hidden ? 'Show annotations' : 'Hide annotations'}
        aria-label="Toggle annotations"
        onClick={() => store().toggleHidden()}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-fg',
          hidden && 'bg-surface-3 text-fg',
        )}
      >
        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <button
        type="button"
        title="Undo"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => store().undo()}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        title="Clear all"
        aria-label="Clear all"
        disabled={!canUndo}
        onClick={() => store().clear()}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 size={16} />
      </button>

      <Divider />

      <button
        type="button"
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
        onClick={onCopy}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
          copied ? 'bg-accent text-accent-fg' : 'bg-accent/90 text-accent-fg hover:bg-accent',
        )}
      >
        {copied ? <Check size={15} /> : <Camera size={15} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        title="Close (Esc)"
        aria-label="Close"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 hover:text-fg"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function Divider(): React.JSX.Element {
  return <span className="mx-1 h-5 w-px bg-line" />;
}
