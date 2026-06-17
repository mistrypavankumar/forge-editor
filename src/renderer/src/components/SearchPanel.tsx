import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { openFilePath } from '../lib/workspace-actions';
import { PanelHeader } from './ui/Panel';
import { ModernFileIcon } from './ModernFileIcon';
import type { SearchMatch } from '@shared/ipc-contract';

export function SearchPanel(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const requestReveal = useEditorStore((s) => s.requestReveal);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!rootPath || query.trim().length < 2) {
      setMatches([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      void window.forge.search(rootPath, query).then((res) => {
        if (res.ok) setMatches(res.data);
        setSearched(true);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, rootPath]);

  const open = (m: SearchMatch): void => {
    if (!rootPath) return;
    const full = `${rootPath}/${m.path}`;
    void openFilePath(full, m.name).then(() => requestReveal({ path: full, line: m.line, col: 1 }));
  };

  // Group matches by file.
  const groups = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    const list = groups.get(m.path) ?? [];
    list.push(m);
    groups.set(m.path, list);
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Search" />
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-accent/60">
          <Search size={13} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files…"
            className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {matches.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-faint">
            {searched ? 'No results' : 'Type at least 2 characters to search.'}
          </p>
        ) : (
          [...groups.entries()].map(([path, list]) => (
            <div key={path}>
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted">
                <ModernFileIcon name={list[0].name} />
                <span className="truncate font-medium">{list[0].name}</span>
                <span className="truncate text-faint">{path}</span>
              </div>
              {list.map((m) => (
                <button
                  key={`${m.path}:${m.line}`}
                  type="button"
                  onClick={() => open(m)}
                  className="flex w-full items-baseline gap-2 px-3 py-0.5 pl-7 text-left hover:bg-surface-2"
                >
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-faint">
                    {m.line}
                  </span>
                  <span className="truncate font-mono text-[12px] text-muted">{m.preview.trim()}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
