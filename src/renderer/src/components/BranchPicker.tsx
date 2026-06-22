import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search } from 'lucide-react';
import { cn } from '../lib/cn';

interface BranchPickerProps {
  x: number;
  y: number;
  branches: string[];
  current: string | null;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

/** Anchored branch switcher with a search filter, for repos with many branches. */
export function BranchPicker({
  x,
  y,
  branches,
  current,
  onSelect,
  onCreate,
  onClose,
}: BranchPickerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? branches.filter((b) => b.toLowerCase().includes(q)) : branches;
  }, [branches, query]);

  // Flip/clamp into the viewport (the list can be tall and open near a screen edge).
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
  }, [x, y, filtered.length]);

  useEffect(() => {
    // Defer so the click that opened the picker doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', onClose);
      window.addEventListener('resize', onClose);
      window.addEventListener('blur', onClose);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[2000] flex max-h-[70vh] w-72 flex-col overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-2xl shadow-black/50"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <Search size={12} className="shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'Enter' && filtered[0]) {
              onSelect(filtered[0]);
              onClose();
            }
          }}
          placeholder="Search branches…"
          className="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-faint">No matching branches</p>
        ) : null}
        {filtered.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              onSelect(b);
              onClose();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-accent/15"
          >
            <span className="flex w-3.5 shrink-0 justify-center text-accent">
              {b === current ? <Check size={13} /> : null}
            </span>
            <span className={cn('truncate', b === current && 'text-accent')}>{b}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          onCreate();
          onClose();
        }}
        className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5 text-left text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Plus size={13} /> Create new branch…
      </button>
    </div>,
    document.body,
  );
}
