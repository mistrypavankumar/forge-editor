import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  checked?: boolean;
  dividerAfter?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Flip/clamp so the menu stays within the viewport (e.g. when opened near the right edge).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 6;
    let nx = x;
    let ny = y;
    if (x + width > window.innerWidth) nx = x - width;
    if (nx < pad) nx = pad;
    if (y + height > window.innerHeight) ny = Math.max(pad, window.innerHeight - height - pad);
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    // Defer so the event that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', onClose);
      window.addEventListener('contextmenu', onClose);
      window.addEventListener('resize', onClose);
      window.addEventListener('blur', onClose);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', onClose);
      window.removeEventListener('contextmenu', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[2000] min-w-56 overflow-hidden rounded-lg border border-line bg-surface-2 py-1 shadow-2xl shadow-black/50"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.label}>
          <button
            type="button"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-accent/15"
          >
            <span className="flex w-3.5 justify-center text-accent">
              {item.checked ? <Check size={13} /> : null}
            </span>
            <span className={cn(item.checked && 'text-accent')}>{item.label}</span>
          </button>
          {item.dividerAfter ? <div className="my-1 h-px bg-line" /> : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}
