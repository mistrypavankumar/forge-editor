import { useEffect, useRef, useState } from 'react';
import { Search, Replace, CaseSensitive, WholeWord, Regex, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useSearchStore } from '../stores/search-store';
import { buildSearchRegExp, replacementFor } from '../lib/search-regex';
import { openFilePath } from '../lib/workspace-actions';
import { PanelHeader } from './ui/Panel';
import { ModernFileIcon } from './ModernFileIcon';
import { cn } from '../lib/cn';
import type { SearchMatch, SearchOptions } from '@shared/ipc-contract';

const MAX_MATCHES = 1000;

// Render a result line with every query occurrence highlighted. Mirrors the flags used by git
// grep on the main side (buildSearchRegExp in search-service.ts) so what's highlighted matches
// what was searched. When `replacement` is non-null, each match renders VS Code-style: the old
// text struck through followed by the inline replacement — a live preview, not yet written to
// disk. An invalid regex degrades to plain text.
function highlightMatches(
  text: string,
  options: SearchOptions,
  replacement: string | null,
): React.ReactNode {
  const re = buildSearchRegExp(options);
  if (!re) return text;
  const out: React.ReactNode[] = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > pos) out.push(text.slice(pos, m.index));
    if (replacement !== null) {
      out.push(
        <span key={key++}>
          <span className="rounded-sm bg-danger/15 text-faint line-through decoration-danger/70">
            {m[0]}
          </span>
          <span className="rounded-sm bg-success/25 text-fg">{replacementFor(m, re, replacement)}</span>
        </span>,
      );
    } else {
      out.push(
        <span key={key++} className="rounded-sm bg-accent/25 text-fg">
          {m[0]}
        </span>,
      );
    }
    pos = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1; // guard against zero-width matches
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out.length > 0 ? <>{out}</> : text;
}

export function SearchPanel(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const requestReveal = useEditorStore((s) => s.requestReveal);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options: SearchOptions = { query, regex, caseSensitive, wholeWord, include, exclude };
  const setPreview = useSearchStore((s) => s.setPreview);
  const seed = useSearchStore((s) => s.seed);
  const setSeed = useSearchStore((s) => s.setSeed);

  // Consume a query handed off from quick-open ("Search '…' in files"): drop it into the input,
  // then clear the seed so it doesn't re-apply and clobber further typing.
  useEffect(() => {
    if (seed === null) return;
    setQuery(seed);
    setSeed(null);
  }, [seed, setSeed]);

  // Publish the live replace to the editor so it renders the inline old→new preview for the open
  // file. Active only when Replace is open with a non-empty replacement and a real query — matching
  // the condition under which the results list shows its own preview. Cleared on panel unmount.
  useEffect(() => {
    const active = showReplace && replacement !== '' && query.trim().length >= 2;
    setPreview(active ? { options: { query, regex, caseSensitive, wholeWord }, replacement } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReplace, replacement, query, regex, caseSensitive, wholeWord, setPreview]);

  useEffect(() => () => setPreview(null), [setPreview]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!rootPath || query.trim().length < 2) {
      setMatches([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      void window.forge.search(rootPath, options).then((res) => {
        if (res.ok) setMatches(res.data);
        setSearched(true);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rootPath, regex, caseSensitive, wholeWord, include, exclude]);

  const open = (m: SearchMatch): void => {
    if (!rootPath) return;
    const full = `${rootPath}/${m.path}`;
    void openFilePath(full, m.name).then(() =>
      requestReveal({ path: full, line: m.line, col: m.col }),
    );
  };

  const toggleCollapse = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Group matches by file.
  const groups = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    const list = groups.get(m.path) ?? [];
    list.push(m);
    groups.set(m.path, list);
  }

  const replaceFiles = async (files: string[]): Promise<void> => {
    if (!rootPath || !showReplace || files.length === 0) return;
    setBusy(true);
    const res = await window.forge.replaceInFiles(rootPath, options, replacement, files);
    setBusy(false);
    if (res.ok) {
      // Refresh open buffers + tree, then re-run the search to reflect the new state.
      useWorkspaceStore.getState().bumpSync();
      if (query.trim().length >= 2) {
        const r = await window.forge.search(rootPath, options);
        if (r.ok) setMatches(r.data);
      }
    }
  };

  const Toggle = ({
    on,
    onClick,
    title,
    icon: Icon,
  }: {
    on: boolean;
    onClick: () => void;
    title: string;
    icon: typeof Regex;
  }): React.JSX.Element => (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn('rounded p-1 hover:bg-surface-3', on ? 'bg-accent/20 text-accent' : 'text-faint')}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Search" />
      <div className="flex gap-1 px-2 pb-2">
        <button
          type="button"
          title={showReplace ? 'Hide replace' : 'Toggle replace'}
          onClick={() => setShowReplace((v) => !v)}
          className="mt-1 shrink-0 self-start rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
        >
          {showReplace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-accent/60">
            <Search size={13} className="shrink-0 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full min-w-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
            />
            <Toggle on={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match Case" icon={CaseSensitive} />
            <Toggle on={wholeWord} onClick={() => setWholeWord((v) => !v)} title="Match Whole Word" icon={WholeWord} />
            <Toggle on={regex} onClick={() => setRegex((v) => !v)} title="Use Regular Expression" icon={Regex} />
          </div>
          {showReplace ? (
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-accent/60">
              <Replace size={13} className="shrink-0 text-faint" />
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replace"
                className="w-full min-w-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
              />
              <button
                type="button"
                title="Replace All"
                disabled={busy || matches.length === 0}
                onClick={() => void replaceFiles([...groups.keys()])}
                className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/15 disabled:opacity-40"
              >
                All
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-faint hover:text-muted"
        >
          {showFilters ? <ChevronDown size={12} /> : <ChevronRight size={12} />} files to include/exclude
        </button>
        {showFilters ? (
          <div className="mt-1 space-y-1">
            <input
              value={include}
              onChange={(e) => setInclude(e.target.value)}
              placeholder="include e.g. src/**, *.ts"
              className="w-full rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent/60"
            />
            <input
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              placeholder="exclude e.g. *.test.ts, dist/**"
              className="w-full rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent/60"
            />
          </div>
        ) : null}
      </div>

      {searched && matches.length > 0 ? (
        <div className="px-3 pb-1 text-[11px] text-faint">
          {matches.length} result{matches.length === 1 ? '' : 's'} in {groups.size} file
          {groups.size === 1 ? '' : 's'}
          {matches.length >= MAX_MATCHES ? ' (showing first 1000)' : ''}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {matches.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-faint">
            {searched ? 'No results' : 'Type at least 2 characters to search.'}
          </p>
        ) : (
          [...groups.entries()].map(([path, list]) => {
            const isCollapsed = collapsed.has(path);
            return (
              <div key={path}>
                <button
                  type="button"
                  onClick={() => toggleCollapse(path)}
                  className="group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-muted hover:bg-surface-2"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="shrink-0 text-faint" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-faint" />
                  )}
                  <ModernFileIcon name={list[0].name} />
                  <span className="truncate font-medium">{list[0].name}</span>
                  <span className="truncate text-faint">{path}</span>
                  <span className="ml-auto shrink-0 rounded bg-surface-3 px-1.5 text-[10px]">{list.length}</span>
                  {showReplace ? (
                    <span
                      role="button"
                      tabIndex={-1}
                      title="Replace in this file"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!busy) void replaceFiles([path]);
                      }}
                      className="shrink-0 rounded p-0.5 text-faint opacity-0 hover:bg-accent/15 hover:text-accent group-hover:opacity-100"
                    >
                      <Replace size={12} />
                    </span>
                  ) : null}
                </button>
                {isCollapsed
                  ? null
                  : list.map((m) => (
                      <button
                        key={`${m.path}:${m.line}:${m.col}`}
                        type="button"
                        onClick={() => open(m)}
                        className="flex w-full items-baseline gap-2 px-3 py-0.5 pl-7 text-left hover:bg-surface-2"
                      >
                        <span className="w-8 shrink-0 text-right font-mono text-[11px] text-faint">
                          {m.line}
                        </span>
                        <span className="truncate font-mono text-[12px] text-muted">
                          {highlightMatches(
                            m.preview.trim(),
                            options,
                            showReplace && replacement !== '' ? replacement : null,
                          )}
                        </span>
                      </button>
                    ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
