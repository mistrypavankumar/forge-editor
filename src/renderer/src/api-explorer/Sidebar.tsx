import { useMemo, useState } from 'react';
import { Search, Trash2, Copy, RotateCw } from 'lucide-react';

import type { HistoryItem } from './types';

import { cn } from '../lib/cn';
import { SchemaTree } from './SchemaTree';
import { Collections } from './Collections';
import { formatTime } from './graphql-utils';
import { useApiExplorerStore } from './store';

type SidebarTab = 'collections' | 'history' | 'schema';

function HistoryList({
  search,
  onRerun,
}: {
  search: string;
  onRerun: (item: HistoryItem) => void;
}): React.JSX.Element {
  const history = useApiExplorerStore((s) => s.history);
  const removeHistory = useApiExplorerStore((s) => s.removeHistory);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return history;
    return history.filter(
      (h) =>
        h.label.toLowerCase().includes(term) ||
        h.url.toLowerCase().includes(term) ||
        h.query.toLowerCase().includes(term),
    );
  }, [history, search]);

  if (filtered.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-faint">
        {history.length === 0 ? 'No history yet.' : 'No history matches.'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      {filtered.map((item) => (
        <div
          key={item.id}
          onClick={() => onRerun(item)}
          className="cursor-pointer rounded-lg border border-line p-2 transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                item.status === 'success' ? 'bg-emerald-400' : 'bg-red-400',
              )}
            />
            <span className="rounded bg-surface-3 px-1 py-0.5 text-[8.5px] font-bold uppercase text-accent">
              {item.method}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg">
              {item.label}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="truncate font-mono text-[10px] text-faint">
              {formatTime(item.timestamp)} · {item.durationMs}ms · {item.responseSummary}
            </span>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                title="Re-run"
                onClick={(e) => {
                  e.stopPropagation();
                  onRerun(item);
                }}
                className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
              >
                <RotateCw size={11} />
              </button>
              <button
                type="button"
                title="Copy query"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard?.writeText(item.query).catch(() => undefined);
                }}
                className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  removeHistory(item.id);
                }}
                className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Sidebar({
  endpoint,
  token,
  headers,
  onInsertOperation,
}: {
  endpoint: string;
  token?: string;
  headers?: Record<string, string>;
  onInsertOperation: (query: string, variables: string) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<SidebarTab>('collections');
  const [search, setSearch] = useState('');
  const loadHistory = useApiExplorerStore((s) => s.loadHistory);
  const clearHistory = useApiExplorerStore((s) => s.clearHistory);

  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'collections', label: 'Collections' },
    { id: 'history', label: 'History' },
    { id: 'schema', label: 'Schema' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-1.5 pb-1">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 focus-within:border-accent/70">
          <Search size={13} className="text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections & schema"
            className="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-1.5">
        <div className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-1.5 py-1 text-[11.5px]',
                tab === t.id ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'history' ? (
          <button
            type="button"
            title="Clear all history"
            onClick={clearHistory}
            className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'collections' ? <Collections search={search} /> : null}
        {tab === 'history' ? <HistoryList search={search} onRerun={loadHistory} /> : null}
        {tab === 'schema' ? (
          <SchemaTree
            endpoint={endpoint}
            token={token}
            headers={headers}
            enabled={tab === 'schema'}
            search={search}
            onInsert={onInsertOperation}
          />
        ) : null}
      </div>
    </div>
  );
}
