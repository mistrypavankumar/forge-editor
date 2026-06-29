import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, AppWindow, Clock } from 'lucide-react';
import type { OpenWindowInfo } from '@shared/ipc-contract';
import { useRecentsStore } from '../stores/recents-store';
import { ModernFolderIcon } from './ModernFolderIcon';

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : path;
}

interface WorkspaceSwitcherProps {
  /** Top-left anchor (the workspace button's bottom-left), in viewport coordinates. */
  x: number;
  y: number;
  onClose: () => void;
}

/** Title-bar dropdown to jump between open Forge windows or reopen a recent project. */
export function WorkspaceSwitcher({ x, y, onClose }: WorkspaceSwitcherProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [windows, setWindows] = useState<OpenWindowInfo[]>([]);
  const recents = useRecentsStore((s) => s.recents);

  const refresh = useCallback(() => {
    void window.forge.listWindows().then(setWindows);
  }, []);

  // Load on open and whenever the set of windows changes (open/close/focus/workspace).
  useEffect(() => {
    refresh();
    return window.forge.onWindowsChanged(refresh);
  }, [refresh]);

  // Flip/clamp so the menu stays within the viewport.
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
  }, [x, y, windows.length, recents.length]);

  useEffect(() => {
    // Defer so the click that opened the menu doesn't immediately close it.
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

  const focusWindow = (id: number): void => {
    window.forge.focusWindow(id);
    onClose();
  };

  // Recent folders that aren't already open in some window — those open in a new window.
  const openPaths = new Set(windows.map((w) => w.rootPath).filter(Boolean) as string[]);
  const recentFolders = recents.filter((r) => r.type === 'folder' && !openPaths.has(r.path));

  const openRecent = (path: string): void => {
    window.forge.openFolderInNewWindow(path);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[2000] max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-line-strong bg-elevated py-1.5 shadow-2xl shadow-black/50"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <AppWindow size={12} /> Open Windows
      </div>
      {windows.map((w) => (
        <button
          key={w.id}
          type="button"
          disabled={w.focused}
          onClick={w.focused ? undefined : () => focusWindow(w.id)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-accent/15 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="flex w-3.5 shrink-0 justify-center text-accent">
            {w.focused ? <Check size={13} /> : null}
          </span>
          {w.rootPath ? (
            <ModernFolderIcon name={w.name} />
          ) : (
            <AppWindow size={15} className="text-faint" />
          )}
          <span className="truncate text-[13px] text-fg">{w.name}</span>
          {w.rootPath ? (
            <span className="ml-auto truncate pl-3 text-[11px] text-faint">{dirOf(w.rootPath)}</span>
          ) : null}
        </button>
      ))}

      {recentFolders.length > 0 ? (
        <>
          <div className="my-1 h-px bg-line" />
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
            <Clock size={12} /> Recent
          </div>
          {recentFolders.map((r) => (
            <button
              key={`${r.type}:${r.path}`}
              type="button"
              onClick={() => openRecent(r.path)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-accent/15"
            >
              <span className="w-3.5 shrink-0" />
              <ModernFolderIcon name={r.name} />
              <span className="truncate text-[13px] text-fg">{r.name}</span>
              <span className="ml-auto truncate pl-3 text-[11px] text-faint">{dirOf(r.path)}</span>
            </button>
          ))}
        </>
      ) : null}
    </div>,
    document.body,
  );
}
