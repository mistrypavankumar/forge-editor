import { useEffect, useMemo, useState } from 'react';
import { commandRegistry } from '../commands/command-registry';
import { fuzzyMatch } from '../util/fuzzy';
import { usePaletteStore } from '../stores/palette-store';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { cn } from '../lib/cn';
import type { FileItem } from '@shared/ipc-contract';

interface Row {
  id: string;
  primary: string;
  secondary?: string;
  invoke: () => void | Promise<void>;
}

export function Palette(): React.JSX.Element | null {
  const open = usePaletteStore((s) => s.open);
  const mode = usePaletteStore((s) => s.mode);
  const close = usePaletteStore((s) => s.close);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);

  // Reset query/selection each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open, mode]);

  // Load files for quick-open.
  useEffect(() => {
    if (open && mode === 'files' && rootPath) {
      void window.forge.listFiles(rootPath).then((res) => {
        if (res.ok) setFiles(res.data);
      });
    }
  }, [open, mode, rootPath]);

  const rows: Row[] = useMemo(() => {
    if (mode === 'commands') {
      return commandRegistry.all().map((c) => ({
        id: c.id,
        primary: c.title,
        secondary: c.category,
        invoke: () => commandRegistry.run(c.id),
      }));
    }
    return files.map((f) => ({
      id: f.path,
      primary: f.name,
      secondary: f.relPath,
      invoke: async () => {
        const res = await window.forge.readFile(f.path);
        if (res.ok) openFile({ path: f.path, name: f.name, content: res.data });
      },
    }));
  }, [mode, files, openFile]);

  const filtered = useMemo(() => {
    const haystack = (r: Row): string => `${r.primary} ${r.secondary ?? ''}`;
    return rows
      .map((r) => ({ row: r, score: fuzzyMatch(query, haystack(r)) }))
      .filter((x) => x.score.matched)
      .sort((a, b) => b.score.score - a.score.score)
      .map((x) => x.row);
  }, [rows, query]);

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
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-[640px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-sm text-fg outline-none placeholder:text-faint"
          autoFocus
          value={query}
          placeholder={mode === 'commands' ? 'Type a command…' : 'Go to file…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {filtered.map((row, i) => (
            <div
              key={row.id}
              className={cn(
                'flex cursor-pointer items-baseline gap-2.5 rounded-lg px-3 py-2',
                i === activeIndex ? 'bg-accent/15' : 'hover:bg-surface-3',
              )}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runAt(i)}
            >
              <span className="text-[13px] text-fg">{row.primary}</span>
              {row.secondary ? (
                <span className="ml-auto truncate text-[11px] text-faint">{row.secondary}</span>
              ) : null}
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-[13px] text-faint">No results</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
