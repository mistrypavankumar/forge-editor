import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search } from 'lucide-react';
import { cn } from '../lib/cn';

interface BranchPickerProps {
  x: number;
  y: number;
  /** All local branches, most recently committed first. */
  branches: string[];
  current: string | null;
  /** Repo default/integration branch (main, dev, …), pinned to the top of the list. */
  defaultBranch: string | null;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
  /** A failure message (e.g. a failed checkout) to show in the footer while the picker stays open. */
  error?: string | null;
}

/** How many recent branches to show before the user searches. */
const RECENT_LIMIT = 5;

/** Anchored branch switcher with a search filter, for repos with many branches. */
export function BranchPicker({
  x,
  y,
  branches,
  current,
  defaultBranch,
  onSelect,
  onCreate,
  onClose,
  error,
}: BranchPickerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [query, setQuery] = useState('');

  // No query → default branch pinned on top, then the few most-recent branches (the user's working
  // set). Searching switches to matching across every branch. The current branch is always kept
  // visible so its check mark shows even if it falls outside the recent slice.
  const { visible, hiddenCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return { visible: branches.filter((b) => b.toLowerCase().includes(q)), hiddenCount: 0 };
    }
    const head = defaultBranch && branches.includes(defaultBranch) ? [defaultBranch] : [];
    const recent = branches.filter((b) => !head.includes(b)).slice(0, RECENT_LIMIT);
    const display = [...head, ...recent];
    if (current && branches.includes(current) && !display.includes(current)) display.push(current);
    return { visible: display, hiddenCount: branches.length - display.length };
  }, [branches, query, defaultBranch, current]);

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
  }, [x, y, visible.length]);

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
            else if (e.key === 'Enter' && visible[0]) {
              onSelect(visible[0]);
              onClose();
            }
          }}
          placeholder="Search branches…"
          className="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-faint">No matching branches</p>
        ) : null}
        {visible.map((b) => (
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
            {b === defaultBranch ? (
              <span className="ml-auto shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-faint">
                default
              </span>
            ) : null}
          </button>
        ))}
        {hiddenCount > 0 ? (
          <p className="px-3 py-1.5 text-[11px] text-faint">
            +{hiddenCount} more — type to search
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 truncate border-t border-line px-3 py-1.5 text-[11px] text-danger" title={error}>
          {error}
        </p>
      ) : null}

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
