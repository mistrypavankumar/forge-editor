import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  CornerDownLeft,
  Command as CommandIcon,
  Braces,
  Box,
  Hash,
  ArrowRightToLine,
  FileSearch,
  HelpCircle,
} from 'lucide-react';
import { commandRegistry } from '../commands/command-registry';
import { fuzzyMatchFields, fuzzyMatchPositions } from '../util/fuzzy';
import { usePaletteStore } from '../stores/palette-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useRecentsStore } from '../stores/recents-store';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSearchStore } from '../stores/search-store';
import { ModernFileIcon } from './ModernFileIcon';
import { loadFiles } from '../lib/quickopen-cache';
import { openFilePath } from '../lib/workspace-actions';
import { cn } from '../lib/cn';
import type { FileItem, LsSymbol, SearchMatch } from '@shared/ipc-contract';

const MAX_ROWS = 50;

// Nudge recently-opened files up the ranking even mid-query. Small relative to a strong name match
// (which scores tens of points) so it breaks ties and lifts near-matches without burying better hits.
const RECENCY_BOOST_TERMS = 12;

/** Which sub-search the palette is running, derived from the query's leading sigil. */
type Kind = 'files' | 'commands' | 'docsym' | 'worksym' | 'line' | 'help' | 'grep';

interface Row {
  id: string;
  primary: string;
  secondary?: string;
  icon: React.ReactNode;
  invoke: () => void | Promise<void>;
}

/** A row with the query-match positions that earned it its rank, for precise highlighting. */
interface Scored {
  row: Row;
  primaryPos: number[];
  secondaryPos: number[];
}

const PREFIXES: Array<{ sigil: string; label: string; hint: string }> = [
  { sigil: '', label: 'Go to File', hint: 'files by name or path' },
  { sigil: '>', label: 'Commands', hint: 'run a command' },
  { sigil: '@', label: 'Symbols in File', hint: 'functions, classes, methods…' },
  { sigil: '#', label: 'Symbols in Workspace', hint: 'project-wide symbol search' },
  { sigil: ':', label: 'Go to Line', hint: ':42 or :42:5' },
];

/** Split a raw query into its mode + the search term (sigil stripped). */
function parseQuery(raw: string, baseMode: 'files' | 'commands'): { kind: Kind; term: string } {
  const sigil = raw[0];
  if (sigil === '>') return { kind: 'commands', term: raw.slice(1) };
  if (sigil === '@') return { kind: 'docsym', term: raw.slice(1) };
  if (sigil === '#') return { kind: 'worksym', term: raw.slice(1) };
  if (sigil === ':') return { kind: 'line', term: raw.slice(1) };
  if (sigil === '?') return { kind: 'help', term: raw.slice(1) };
  // In file mode, a `>` after some text opts into content search: `word > pathFilter`. (A leading
  // `>` is the commands sigil, handled above, so this only triggers mid-query.)
  if (baseMode === 'files' && raw.indexOf('>') > 0) return { kind: 'grep', term: raw };
  return { kind: baseMode, term: raw };
}

/** Split a `word > pathFilter` grep query into its content term and its (optional) path filter. */
function parseGrep(raw: string): { term: string; pathFilter: string } {
  const gt = raw.indexOf('>');
  if (gt < 0) return { term: raw.trim(), pathFilter: '' };
  return { term: raw.slice(0, gt).trim(), pathFilter: raw.slice(gt + 1).trim() };
}

/** Indices covered by every case-insensitive literal occurrence of `term` in `text` (for highlight). */
function literalPositions(term: string, text: string): number[] {
  if (!term) return [];
  const t = term.toLowerCase();
  const hay = text.toLowerCase();
  const out: number[] = [];
  for (let i = hay.indexOf(t); i >= 0; i = hay.indexOf(t, i + t.length)) {
    for (let k = 0; k < t.length; k++) out.push(i + k);
  }
  return out;
}

function symbolIcon(kind: string): React.ReactNode {
  if (kind === 'function' || kind === 'method' || kind === 'local function' || kind === 'getter' || kind === 'setter')
    return <Braces size={14} className="text-purple-400" />;
  if (kind === 'class' || kind === 'interface' || kind === 'type' || kind === 'enum' || kind === 'module')
    return <Box size={14} className="text-blue-400" />;
  return <Hash size={14} className="text-faint" />;
}

/** Highlight the given target indices (from the fuzzy matcher), so the bold reflects what ranked. */
function highlight(text: string, positions: number[]): React.ReactNode {
  if (positions.length === 0) return text;
  const set = new Set(positions);
  const out: React.ReactNode[] = [];
  let run = '';
  let hl = '';
  const flush = (): void => {
    if (run) out.push(run);
    if (hl) out.push(<span key={out.length} className="font-semibold text-accent">{hl}</span>);
    run = '';
    hl = '';
  };
  for (let i = 0; i < text.length; i++) {
    if (set.has(i)) {
      if (run) {
        out.push(run);
        run = '';
      }
      hl += text[i];
    } else {
      if (hl) {
        out.push(<span key={out.length} className="font-semibold text-accent">{hl}</span>);
        hl = '';
      }
      run += text[i];
    }
  }
  flush();
  return <>{out}</>;
}

/** Parse `:42` / `42:5` into a 1-based line (+ optional column). */
function parseLineTarget(term: string): { line: number; col: number } | null {
  const m = term.trim().match(/^(\d+)(?::(\d+))?$/);
  if (!m) return null;
  const line = parseInt(m[1], 10);
  if (!line) return null;
  return { line, col: m[2] ? parseInt(m[2], 10) : 1 };
}

export function Palette(): React.JSX.Element | null {
  const open = usePaletteStore((s) => s.open);
  const mode = usePaletteStore((s) => s.mode);
  const initialQuery = usePaletteStore((s) => s.initialQuery);
  const close = usePaletteStore((s) => s.close);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [docSymbols, setDocSymbols] = useState<LsSymbol[]>([]);
  const [workSymbols, setWorkSymbols] = useState<LsSymbol[]>([]);
  const [grepMatches, setGrepMatches] = useState<SearchMatch[]>([]);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const recents = useRecentsStore((s) => s.recents);
  const activePath = useEditorStore((s) => s.activePath);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const symTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { kind, term } = parseQuery(query, mode === 'commands' ? 'commands' : 'files');
  const { term: grepTerm, pathFilter: grepPath } = kind === 'grep' ? parseGrep(term) : { term: '', pathFilter: '' };

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setActiveIndex(0);
    }
  }, [open, mode, initialQuery]);

  // Load (cached) the workspace file list for quick-open.
  useEffect(() => {
    if (!open || kind !== 'files' || !rootPath) return;
    void loadFiles(rootPath).then(setFiles);
  }, [open, kind, rootPath]);

  // Fetch the active file's symbols when `@` mode opens (or the active file changes). Term-independent
  // (we filter locally), so typing doesn't refetch.
  useEffect(() => {
    if (!open || kind !== 'docsym' || !activePath) {
      if (kind !== 'docsym') setDocSymbols([]);
      return;
    }
    let cancelled = false;
    void window.forge.editorLanguage.getDocumentSymbols(activePath).then((res) => {
      if (!cancelled) setDocSymbols(res.ok ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, kind, activePath]);

  // Workspace symbol search is server-side (TS "navigate to" does its own ranking), so it re-queries
  // on the term — debounced to avoid a request per keystroke.
  useEffect(() => {
    if (!open || kind !== 'worksym') return;
    if (symTimer.current) clearTimeout(symTimer.current);
    if (term.trim().length < 2) {
      setWorkSymbols([]);
      return;
    }
    symTimer.current = setTimeout(() => {
      void window.forge.editorLanguage
        .getWorkspaceSymbols(term.trim(), activePath ?? undefined)
        .then((res) => setWorkSymbols(res.ok ? res.data : []));
    }, 160);
    return () => {
      if (symTimer.current) clearTimeout(symTimer.current);
    };
  }, [open, kind, term, activePath]);

  // Content search (`word > pathFilter`): grep the workspace for the word, server-side. Refetch on
  // the grep term (debounced); the path filter is applied locally so typing it doesn't re-query.
  useEffect(() => {
    if (!open || kind !== 'grep' || !rootPath) return;
    if (grepTimer.current) clearTimeout(grepTimer.current);
    if (grepTerm.length < 2) {
      setGrepMatches([]);
      return;
    }
    grepTimer.current = setTimeout(() => {
      void window.forge
        .search(rootPath, { query: grepTerm, regex: false, caseSensitive: false, wholeWord: false })
        .then((res) => setGrepMatches(res.ok ? res.data : []));
    }, 200);
    return () => {
      if (grepTimer.current) clearTimeout(grepTimer.current);
    };
  }, [open, kind, grepTerm, rootPath]);

  // Reveal a symbol/line, opening its file first (handles targets in other files).
  const revealAt = (file: string, line: number, col: number): void => {
    const name = file.slice(file.lastIndexOf('/') + 1);
    void openFilePath(file, name, true).then(() =>
      useEditorStore.getState().requestReveal({ path: file, line, col }),
    );
  };

  const relOf = (file: string): string =>
    rootPath && file.startsWith(`${rootPath}/`) ? file.slice(rootPath.length + 1) : file;

  // Most-recent-first rank of files under this workspace, for the recency boost + the empty-query list.
  const recentRank = useMemo(() => {
    const map = new Map<string, number>();
    if (!rootPath) return map;
    let rank = 0;
    for (const r of recents) {
      if (r.type === 'file' && r.path.startsWith(`${rootPath}/`)) map.set(r.path, rank++);
    }
    return map;
  }, [recents, rootPath]);

  // Base row set for the active mode (unfiltered).
  const rows: Row[] = useMemo(() => {
    if (kind === 'grep') {
      if (!rootPath) return [];
      return grepMatches.map((m, i) => ({
        id: `${m.path}:${m.line}:${m.col}:${i}`,
        primary: m.preview.trim(),
        secondary: `${m.path}:${m.line}`,
        icon: <ModernFileIcon name={m.name} size={15} />,
        invoke: () => revealAt(`${rootPath}/${m.path}`, m.line, m.col),
      }));
    }
    if (kind === 'commands') {
      return commandRegistry.all().map((c) => ({
        id: c.id,
        primary: c.title,
        secondary: c.category,
        icon: <CommandIcon size={14} className="text-faint" />,
        invoke: () => commandRegistry.run(c.id),
      }));
    }
    if (kind === 'docsym') {
      return docSymbols.map((s, i) => ({
        id: `${s.name}:${s.line}:${s.column}:${i}`,
        primary: s.name,
        secondary: s.containerName ? `${s.containerName} · ${s.kind}` : s.kind,
        icon: symbolIcon(s.kind),
        invoke: () => revealAt(s.file, s.line, s.column),
      }));
    }
    if (kind === 'worksym') {
      return workSymbols.map((s, i) => ({
        id: `${s.file}:${s.line}:${s.column}:${i}`,
        primary: s.name,
        secondary: `${s.containerName ? `${s.containerName} · ` : ''}${relOf(s.file)}:${s.line}`,
        icon: symbolIcon(s.kind),
        invoke: () => revealAt(s.file, s.line, s.column),
      }));
    }
    if (kind === 'line' || kind === 'help') return [];
    return files.map((f) => ({
      id: f.path,
      primary: f.name,
      secondary: f.relPath,
      icon: <ModernFileIcon name={f.name} size={15} />,
      invoke: () => openFilePath(f.path, f.name, true),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, files, docSymbols, workSymbols, grepMatches, rootPath]);

  // Files recently opened, shown when the file palette opens with an empty query.
  const recentRows: Row[] = useMemo(() => {
    if (kind !== 'files' || !rootPath) return [];
    return [...recentRank.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([path]) => {
        const name = path.slice(path.lastIndexOf('/') + 1);
        return {
          id: path,
          primary: name,
          secondary: relOf(path),
          icon: <ModernFileIcon name={name} size={15} />,
          invoke: () => openFilePath(path, name, true),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, recentRank, rootPath]);

  const showingRecents = kind === 'files' && !term && recentRows.length > 0;

  const scored: Scored[] = useMemo(() => {
    // Line + help are synthetic (built below); handled in `shown`.
    if (kind === 'line' || kind === 'help') return [];
    // Grep: keep git-grep's order, filter locally by the path filter, highlight the term in the code
    // preview and the filter in the path. Stable sort keeps a file's lines grouped.
    if (kind === 'grep') {
      return rows
        .map((row) => {
          const relPath = row.secondary ? row.secondary.slice(0, row.secondary.lastIndexOf(':')) : '';
          const pf = grepPath ? fuzzyMatchPositions(grepPath, relPath) : null;
          return {
            row,
            keep: pf ? pf.matched : true,
            score: pf ? pf.score : 0,
            primaryPos: literalPositions(grepTerm, row.primary),
            secondaryPos: pf ? pf.positions : [],
          };
        })
        .filter((x) => x.keep)
        .sort((a, b) => b.score - a.score)
        .map(({ row, primaryPos, secondaryPos }) => ({ row, primaryPos, secondaryPos }));
    }
    // Workspace symbols are ranked server-side; keep that order, highlight best-effort by name.
    if (kind === 'worksym') {
      return rows.map((row) => ({
        row,
        primaryPos: fuzzyMatchPositions(term.trim(), row.primary).positions,
        secondaryPos: [],
      }));
    }
    if (!term) {
      // Files: show recents first; fall back to the full list when there are none, so the palette
      // is never empty on open. Other modes list everything.
      const base = kind === 'files' ? (recentRows.length ? recentRows : rows) : rows;
      return base.map((row) => ({ row, primaryPos: [], secondaryPos: [] }));
    }
    return rows
      .map((row) => {
        const m = fuzzyMatchFields(term, row.primary, row.secondary ?? '');
        let score = m.score;
        if (kind === 'files') {
          const rank = recentRank.get(row.id);
          if (rank !== undefined) score += Math.max(0, RECENCY_BOOST_TERMS - rank);
        }
        return { row, score, matched: m.matched, primaryPos: m.primary, secondaryPos: m.secondary };
      })
      .filter((x) => x.matched)
      .sort((a, b) => b.score - a.score)
      .map(({ row, primaryPos, secondaryPos }) => ({ row, primaryPos, secondaryPos }));
  }, [rows, recentRows, term, kind, recentRank, grepTerm, grepPath]);

  // Synthetic rows for the modes that aren't a filtered list.
  const synthetic: Scored[] = useMemo(() => {
    if (kind === 'help') {
      return PREFIXES.map((p) => ({
        row: {
          id: `help:${p.sigil || 'files'}`,
          primary: p.label,
          secondary: `${p.sigil || '(no prefix)'} — ${p.hint}`,
          icon: <HelpCircle size={14} className="text-faint" />,
          invoke: () => setQuery(p.sigil),
        },
        primaryPos: [],
        secondaryPos: [],
      }));
    }
    if (kind === 'line') {
      const target = parseLineTarget(term);
      const name = activePath ? activePath.slice(activePath.lastIndexOf('/') + 1) : null;
      if (!activePath || !name) return [];
      if (!target) return [];
      return [
        {
          row: {
            id: 'goto-line',
            primary: target.col > 1 ? `Go to line ${target.line}, column ${target.col}` : `Go to line ${target.line}`,
            secondary: name,
            icon: <ArrowRightToLine size={14} className="text-faint" />,
            invoke: () => useEditorStore.getState().requestReveal({ path: activePath, line: target.line, col: target.col }),
          },
          primaryPos: [],
          secondaryPos: [],
        },
      ];
    }
    return [];
  }, [kind, term, activePath]);

  // In files mode with no matches, offer to run the query as a full-text search instead.
  const handoff: Scored | null = useMemo(() => {
    if (kind !== 'files' || !term.trim() || scored.length > 0 || !rootPath) return null;
    return {
      row: {
        id: 'search-handoff',
        primary: `Search “${term.trim()}” in files`,
        secondary: 'open Search',
        icon: <FileSearch size={14} className="text-faint" />,
        invoke: () => {
          useSearchStore.getState().setSeed(term.trim());
          const l = useLayoutStore.getState();
          l.setActivity('search');
          l.setPanelVisible('sidebar', true);
        },
      },
      primaryPos: [],
      secondaryPos: [],
    };
  }, [kind, term, scored.length, rootPath]);

  const results: Scored[] = kind === 'help' || kind === 'line' ? synthetic : scored;
  const withHandoff = handoff ? [...results, handoff] : results;
  const shown = withHandoff.slice(0, MAX_ROWS);

  // Keep the active selection in range as the result set changes, and scrolled into view.
  useEffect(() => {
    if (activeIndex > shown.length - 1) setActiveIndex(shown.length > 0 ? shown.length - 1 : 0);
  }, [shown.length, activeIndex]);
  useEffect(() => {
    // Optional-chain the method too: jsdom (tests) doesn't implement scrollIntoView.
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const runAt = (index: number): void => {
    const item = shown[index];
    if (!item) return;
    close();
    void item.row.invoke();
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

  const placeholder =
    kind === 'commands'
      ? 'Type a command…'
      : kind === 'docsym'
        ? 'Go to symbol in file…'
        : kind === 'worksym'
          ? 'Go to symbol in workspace…'
          : kind === 'line'
            ? 'Go to line…  (e.g. 42 or 42:5)'
            : kind === 'help'
              ? 'Pick a search mode…'
              : kind === 'grep'
                ? 'Search file contents…  (word > path to filter)'
                : 'Go to file…  (type > for commands, @ symbols, : line, ? help)';

  const emptyFiles = kind === 'files' && !rootPath;
  const emptyMessage = ((): string => {
    if (kind === 'docsym') return activePath ? 'No symbols in this file' : 'Open a file to search its symbols';
    if (kind === 'worksym') return term.trim().length < 2 ? 'Type at least 2 characters' : 'No symbols found';
    if (kind === 'line') return activePath ? 'Type a line number' : 'Open a file first';
    if (kind === 'grep')
      return grepTerm.length < 2 ? 'Type a word to search file contents' : `No matches for “${grepTerm}”`;
    if (kind === 'files' && !term) return 'Start typing to search files';
    return 'No results';
  })();

  const footerCount = showingRecents
    ? `Recently opened · ${results.length}`
    : withHandoff.length > MAX_ROWS
      ? `Showing ${MAX_ROWS} of ${withHandoff.length}`
      : `${withHandoff.length} result${withHandoff.length === 1 ? '' : 's'}`;

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
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {emptyFiles ? (
            <div className="px-3 py-6 text-center text-[13px] text-faint">
              Open a folder to search files
            </div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-faint">{emptyMessage}</div>
          ) : (
            shown.map((item, i) => (
              <button
                key={item.row.id}
                type="button"
                ref={i === activeIndex ? activeRef : null}
                // Use mousemove, not mouseenter: typing remounts rows under a stationary cursor, and
                // mouseenter would fire on that remount and hijack the selection away from the top
                // match. mousemove only fires on real pointer movement, so keyboard selection sticks.
                onMouseMove={() => setActiveIndex(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                  i === activeIndex ? 'bg-active' : 'hover:bg-surface-3',
                )}
              >
                <span className="flex shrink-0 items-center">{item.row.icon}</span>
                <span className="shrink-0 truncate text-[13px] text-fg">
                  {highlight(item.row.primary, item.primaryPos)}
                </span>
                {item.row.secondary ? (
                  <span className="ml-auto truncate pl-3 text-[11px] text-faint">
                    {highlight(item.row.secondary, item.secondaryPos)}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-faint">
          <span>{footerCount}</span>
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
