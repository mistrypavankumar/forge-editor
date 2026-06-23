import { useEffect, useMemo, useState } from 'react';
import { Search, CornerDownLeft, Command as CommandIcon } from 'lucide-react';
import { commandRegistry } from '../commands/command-registry';
import { fuzzyMatchTerms } from '../util/fuzzy';
import { usePaletteStore } from '../stores/palette-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useRecentsStore } from '../stores/recents-store';
import { ModernFileIcon } from './ModernFileIcon';
import { loadFiles } from '../lib/quickopen-cache';
import { openFilePath } from '../lib/workspace-actions';
import { cn } from '../lib/cn';
import type { FileItem } from '@shared/ipc-contract';

const MAX_ROWS = 50;

interface Row {
  id: string;
  primary: string;
  secondary?: string;
  isFile: boolean;
  invoke: () => void | Promise<void>;
}

function highlight(text: string, query: string): React.ReactNode {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;
  const lower = text.toLowerCase();
  // First occurrence of each term, merged into non-overlapping ranges.
  const ranges = terms
    .map((t) => [lower.indexOf(t), t.length] as const)
    .filter(([i]) => i !== -1)
    .map(([i, len]) => [i, i + len] as [number, number]);
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(<span key={i} className="font-semibold text-accent">{text.slice(s, e)}</span>);
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

export function Palette(): React.JSX.Element | null {
  const open = usePaletteStore((s) => s.open);
  const mode = usePaletteStore((s) => s.mode);
  const close = usePaletteStore((s) => s.close);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const recents = useRecentsStore((s) => s.recents);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open, mode]);

  // Load (cached) the workspace file list for quick-open.
  useEffect(() => {
    if (!open || mode !== 'files' || !rootPath) return;
    void loadFiles(rootPath).then(setFiles);
  }, [open, mode, rootPath]);

  const rows: Row[] = useMemo(() => {
    if (mode === 'commands') {
      return commandRegistry.all().map((c) => ({
        id: c.id,
        primary: c.title,
        secondary: c.category,
        isFile: false,
        invoke: () => commandRegistry.run(c.id),
      }));
    }
    return files.map((f) => ({
      id: f.path,
      primary: f.name,
      secondary: f.relPath,
      isFile: true,
      invoke: () => openFilePath(f.path, f.name, true),
    }));
  }, [mode, files]);

  // Recently opened files, shown when the file palette opens with an empty query. Scoped to the
  // current workspace: only files under the open folder are shown, so switching projects shows
  // that project's recents (not stale entries from other folders).
  const recentRows: Row[] = useMemo(() => {
    if (mode !== 'files' || !rootPath) return [];
    return recents
      .filter((r) => r.type === 'file' && r.path.startsWith(`${rootPath}/`))
      .map((r) => ({
        id: r.path,
        primary: r.name,
        secondary: r.path.slice(rootPath.length + 1),
        isFile: true,
        invoke: () => openFilePath(r.path, r.name, true),
      }));
  }, [mode, recents, rootPath]);

  const showingRecents = mode === 'files' && !query && recentRows.length > 0;

  const filtered = useMemo(() => {
    if (!query) return mode === 'files' ? recentRows : rows;
    return rows
      .map((r) => ({ row: r, score: fuzzyMatchTerms(query, `${r.primary} ${r.secondary ?? ''}`) }))
      .filter((x) => x.score.matched)
      .sort((a, b) => b.score.score - a.score.score)
      .map((x) => x.row);
  }, [rows, query, mode, recentRows]);

  const shown = filtered.slice(0, MAX_ROWS);

  if (!open) return null;

  const runAt = (index: number): void => {
    const row = filtered[index];
    if (!row) return;
    close();
    void row.invoke();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  const emptyFiles = mode === 'files' && !rootPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[60vh] w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            className="w-full bg-transparent py-3.5 text-sm text-fg outline-none placeholder:text-faint"
            autoFocus
            value={query}
            placeholder={mode === 'commands' ? 'Type a command…' : 'Go to file…'}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {emptyFiles ? (
            <div className="px-3 py-6 text-center text-[13px] text-faint">
              Open a folder to search files
            </div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-faint">
              {mode === 'files' && !query ? 'Start typing to search files' : 'No results'}
            </div>
          ) : (
            shown.map((row, i) => (
              <button
                key={row.id}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                  i === activeIndex ? 'bg-active' : 'hover:bg-surface-3',
                )}
              >
                <span className="flex shrink-0 items-center">
                  {row.isFile ? (
                    <ModernFileIcon name={row.primary} size={15} />
                  ) : (
                    <CommandIcon size={14} className="text-faint" />
                  )}
                </span>
                <span className="shrink-0 truncate text-[13px] text-fg">
                  {highlight(row.primary, query)}
                </span>
                {row.secondary ? (
                  <span className="ml-auto truncate pl-3 text-[11px] text-faint">
                    {highlight(row.secondary, query)}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-faint">
          <span>
            {showingRecents
              ? `Recently opened · ${filtered.length}`
              : filtered.length > MAX_ROWS
                ? `Showing ${MAX_ROWS} of ${filtered.length}`
                : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={11} /> open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 font-mono">esc</kbd>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
