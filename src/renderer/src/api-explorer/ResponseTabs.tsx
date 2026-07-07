import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Loader2, Search, X, ChevronUp, ChevronDown } from 'lucide-react';

import type { ExecutionResult } from './types';

import { cn } from '../lib/cn';
import { formatTime, formatBytes } from './graphql-utils';

type ResponseTab = 'pretty' | 'raw' | 'headers' | 'errors' | 'metadata';

/** A [start, end) character range within the searched text. */
type MatchRange = readonly [number, number];

type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'plain';

/** Token colours tuned for the dark theme (all read well on the frosted surface). */
const TOKEN_CLS: Record<JsonTokenType, string> = {
  key: 'text-sky-300',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  boolean: 'text-purple-300',
  null: 'text-rose-300',
  plain: 'text-faint',
};

/** Above this size we skip tokenising to keep rendering snappy. */
const HIGHLIGHT_LIMIT = 200_000;

const JSON_TOKEN_RE = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Split a JSON string into typed segments that fully cover the input (offsets preserved). */
function tokenizeJson(text: string): { text: string; type: JsonTokenType }[] {
  const tokens: { text: string; type: JsonTokenType }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  JSON_TOKEN_RE.lastIndex = 0;
  while ((m = JSON_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index), type: 'plain' });
    const raw = m[0];
    let type: JsonTokenType;
    if (raw[0] === '"') {
      type = /^\s*:/.test(text.slice(JSON_TOKEN_RE.lastIndex)) ? 'key' : 'string';
    } else if (raw === 'true' || raw === 'false') {
      type = 'boolean';
    } else if (raw === 'null') {
      type = 'null';
    } else {
      type = 'number';
    }
    tokens.push({ text: raw, type });
    last = JSON_TOKEN_RE.lastIndex;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), type: 'plain' });
  return tokens;
}

/** All case-insensitive occurrences of `query` in `text`, in document order. */
function findMatches(text: string, query: string): MatchRange[] {
  if (!query) return [];
  const ranges: MatchRange[] = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let idx = 0;
  for (;;) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    ranges.push([found, found + needle.length]);
    idx = found + needle.length;
  }
  return ranges;
}

function CopyButton({ value }: { value: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!value}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          },
          () => undefined,
        );
      }}
      className={cn('rounded p-1 hover:bg-surface-3', copied ? 'text-emerald-400' : 'text-faint hover:text-fg')}
      title="Copy response"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/**
 * A syntax-highlighted, search-aware code viewer. Highlights JSON tokens and, when a
 * find query is active, wraps matching substrings — the active match gets a ref so the
 * parent can scroll it into view.
 */
function CodeBlock({
  text,
  query,
  matches,
  activeMatch,
  activeRef,
}: {
  text: string;
  query: string;
  matches: MatchRange[];
  activeMatch: number;
  activeRef: React.MutableRefObject<HTMLElement | null>;
}): React.JSX.Element {
  const nodes = useMemo(() => {
    const highlight = text.length <= HIGHLIGHT_LIMIT;
    const tokens = highlight ? tokenizeJson(text) : [{ text, type: 'plain' as JsonTokenType }];
    const out: React.ReactNode[] = [];
    let off = 0;
    let matchPtr = 0;
    let key = 0;
    for (const tok of tokens) {
      const start = off;
      const end = off + tok.text.length;
      off = end;
      const cls = TOKEN_CLS[tok.type];

      // Drop matches that end before this token; they can't apply to later tokens either.
      while (matchPtr < matches.length && matches[matchPtr][1] <= start) matchPtr++;

      // Fast path: no match overlaps this token.
      if (matchPtr >= matches.length || matches[matchPtr][0] >= end) {
        out.push(
          <span key={key++} className={cls}>
            {tok.text}
          </span>,
        );
        continue;
      }

      // Split the token around any overlapping matches.
      const pieces: React.ReactNode[] = [];
      let cursor = start;
      let mp = matchPtr;
      while (mp < matches.length && matches[mp][0] < end) {
        const [ms, me] = matches[mp];
        const os = Math.max(ms, start);
        const oe = Math.min(me, end);
        if (os > cursor) pieces.push(text.slice(cursor, os));
        const isActive = mp === activeMatch;
        pieces.push(
          <mark
            key={`m${mp}-${cursor}`}
            ref={isActive ? (el) => { if (el) activeRef.current = el; } : undefined}
            className={cn(
              'rounded-[3px] text-inherit',
              isActive ? 'bg-amber-400 text-black' : 'bg-amber-400/30',
            )}
          >
            {text.slice(os, oe)}
          </mark>,
        );
        cursor = oe;
        if (me <= end) mp++;
        else break;
      }
      if (cursor < end) pieces.push(text.slice(cursor, end));
      out.push(
        <span key={key++} className={cls}>
          {pieces}
        </span>,
      );
    }
    return out;
  }, [text, matches, activeMatch, activeRef]);

  // `query` participates only through `matches`; referenced to satisfy exhaustive-deps intent.
  void query;

  return (
    <pre className="m-0 h-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface/50 p-3 font-mono text-[11.5px] leading-relaxed text-fg">
      {nodes}
    </pre>
  );
}

function MetaRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5">
      <span className="text-[11.5px] text-faint">{label}</span>
      <span className="break-all text-right font-mono text-[11.5px] text-fg">{value}</span>
    </div>
  );
}

const TABS: { id: ResponseTab; label: string }[] = [
  { id: 'pretty', label: 'Pretty' },
  { id: 'raw', label: 'Raw' },
  { id: 'headers', label: 'Headers' },
  { id: 'errors', label: 'Errors' },
  { id: 'metadata', label: 'Metadata' },
];

/** The floating find widget, shown over the response body on ⌘/Ctrl+F. */
function FindBar({
  query,
  onQuery,
  total,
  current,
  onNext,
  onPrev,
  onClose,
  inputRef,
}: {
  query: string;
  onQuery: (v: string) => void;
  total: number;
  current: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-line bg-elevated/95 py-1 pl-2 pr-1 shadow-lg backdrop-blur">
      <Search size={13} className="text-faint" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in response"
        spellCheck={false}
        className="w-40 bg-transparent text-[12px] text-fg placeholder:text-faint focus:outline-none"
      />
      <span className="min-w-[3.5rem] text-right font-mono text-[10.5px] text-faint tabular-nums">
        {query ? (total ? `${current} / ${total}` : 'No results') : ''}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={total === 0}
        title="Previous match (⇧Enter)"
        className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg disabled:opacity-40"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={total === 0}
        title="Next match (Enter)"
        className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg disabled:opacity-40"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ResponseTabs({
  result,
  running,
}: {
  result: ExecutionResult | null;
  running: boolean;
}): React.JSX.Element {
  const [tab, setTab] = useState<ResponseTab>('pretty');

  const prettyText = useMemo(() => {
    if (!result) return '';
    if (result.data !== undefined) return JSON.stringify(result.data, null, 2);
    if (result.raw) {
      try {
        return JSON.stringify(JSON.parse(result.raw), null, 2);
      } catch {
        return result.raw;
      }
    }
    return '';
  }, [result]);

  const errorCount = result?.errors?.length ?? 0;
  const hasNetworkError = Boolean(result?.networkError);

  // Auto-select a tab whenever a new result lands: jump to Errors when the request
  // failed (network error or GraphQL errors), otherwise fall back to Pretty.
  useEffect(() => {
    if (!result) return;
    setTab(result.networkError || (result.errors?.length ?? 0) > 0 ? 'errors' : 'pretty');
  }, [result]);

  const headerEntries = useMemo(
    () => Object.entries(result?.responseHeaders ?? {}),
    [result],
  );
  const copyValue =
    tab === 'raw'
      ? (result?.raw ?? '')
      : tab === 'headers'
        ? headerEntries.map(([k, v]) => `${k}: ${v}`).join('\n')
        : prettyText;

  // ── Find in response (⌘/Ctrl+F) ──────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);

  // Only the text-based tabs are searchable.
  const searchText = tab === 'pretty' ? prettyText : tab === 'raw' ? (result?.raw ?? '') : '';
  const searchable = tab === 'pretty' || tab === 'raw';

  const matches = useMemo(
    () => (findOpen && searchable ? findMatches(searchText, query) : []),
    [findOpen, searchable, searchText, query],
  );

  // Keep the active match index within bounds as matches change.
  useEffect(() => {
    setActiveMatch((i) => (matches.length === 0 ? 0 : Math.min(i, matches.length - 1)));
  }, [matches]);

  // Scroll the active match into view when it (or the match set) changes.
  useEffect(() => {
    activeMatchRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeMatch, matches]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setQuery('');
    setActiveMatch(0);
  }, []);

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      setActiveMatch((i) => {
        if (matches.length === 0) return 0;
        return (i + dir + matches.length) % matches.length;
      });
    },
    [matches.length],
  );

  // ⌘/Ctrl+F opens the find bar when focus is inside the response panel (or nothing
  // else is focused), so it doesn't hijack find elsewhere in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        const active = document.activeElement;
        const scoped =
          containerRef.current?.contains(active) || active === document.body || active === null;
        if (!scoped) return;
        e.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentMatchLabel = matches.length ? activeMatch + 1 : 0;

  const statusTone = !result
    ? 'idle'
    : result.networkError || errorCount > 0
      ? 'error'
      : result.ok
        ? 'success'
        : 'warning';
  const statusLabel = !result
    ? 'Idle'
    : result.networkError
      ? 'Network error'
      : `HTTP ${result.httpStatus ?? '—'}${errorCount > 0 ? ` · ${errorCount} err` : ''}`;
  const toneCls =
    statusTone === 'success'
      ? 'bg-emerald-500/15 text-emerald-400'
      : statusTone === 'error'
        ? 'bg-red-500/15 text-red-400'
        : statusTone === 'warning'
          ? 'bg-amber-500/15 text-amber-400'
          : 'bg-surface-3 text-muted';

  return (
    <div ref={containerRef} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Response</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', toneCls)}>
            {statusLabel}
          </span>
          {result && !result.networkError ? (
            <span className="font-mono text-[11px] text-faint">
              {result.durationMs}ms · {formatBytes(result.responseSize)}
            </span>
          ) : null}
        </div>
        {result ? <CopyButton value={copyValue} /> : null}
      </div>

      <div className="flex items-center gap-1 px-2 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-2 py-1 text-[12px]',
              tab === t.id ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {t.id === 'errors' && (errorCount > 0 || hasNetworkError)
              ? `Errors (${errorCount || 1})`
              : t.label}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-2">
        {findOpen && searchable ? (
          <FindBar
            query={query}
            onQuery={(v) => {
              setQuery(v);
              setActiveMatch(0);
            }}
            total={matches.length}
            current={currentMatchLabel}
            onNext={() => stepMatch(1)}
            onPrev={() => stepMatch(-1)}
            onClose={closeFind}
            inputRef={findInputRef}
          />
        ) : null}
        <div className="h-full overflow-auto">
          {running ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[12px] text-faint">
              <Loader2 size={22} className="animate-spin" />
              Running operation…
            </div>
          ) : !result ? (
            <div className="grid h-full place-items-center px-6 text-center text-[12.5px] text-faint">
              Run an operation to see the response here.
            </div>
          ) : tab === 'pretty' ? (
            prettyText ? (
              <CodeBlock
                text={prettyText}
                query={query}
                matches={matches}
                activeMatch={activeMatch}
                activeRef={activeMatchRef}
              />
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-faint">No data in the response.</div>
            )
          ) : tab === 'raw' ? (
            result.raw ? (
              <CodeBlock
                text={result.raw}
                query={query}
                matches={matches}
                activeMatch={activeMatch}
                activeRef={activeMatchRef}
              />
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-faint">Empty response body.</div>
            )
          ) : tab === 'headers' ? (
            headerEntries.length > 0 ? (
              <div className="px-1">
                {headerEntries.map(([k, v]) => (
                  <MetaRow key={k} label={k} value={v} />
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-faint">No response headers.</div>
            )
          ) : tab === 'errors' ? (
            hasNetworkError || errorCount > 0 ? (
              <div className="flex flex-col gap-2">
                {hasNetworkError ? (
                  <div className="rounded-lg border border-red-500/50 bg-red-500/5 p-2.5">
                    <div className="text-[11px] font-bold text-red-400">Network error</div>
                    <div className="font-mono text-[11.5px] text-fg">{result.networkError}</div>
                  </div>
                ) : null}
                {result.errors?.map((err, i) => (
                  <div key={i} className="rounded-lg border border-line bg-red-500/5 p-2.5">
                    <div className="text-[12.5px] text-red-400">{err.message}</div>
                    {err.path ? (
                      <div className="mt-1 font-mono text-[10.5px] text-faint">path: {err.path.join(' › ')}</div>
                    ) : null}
                    {err.extensions ? (
                      <pre className="m-0 mt-1 whitespace-pre-wrap font-mono text-[10.5px] text-muted">
                        {JSON.stringify(err.extensions, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-faint">No errors. 🎉</div>
            )
          ) : (
            <div className="px-1">
              <MetaRow label="Method" value={result.method} />
              <MetaRow label="URL" value={result.url} />
              {result.operationType ? (
                <>
                  <MetaRow label="Operation" value={result.operationName} />
                  <MetaRow label="Type" value={result.operationType} />
                </>
              ) : null}
              <MetaRow
                label="HTTP status"
                value={result.networkError ? 'failed' : `${result.httpStatus ?? '—'} ${result.httpStatusText}`}
              />
              <MetaRow label="Duration" value={`${result.durationMs} ms`} />
              <MetaRow label="Timestamp" value={formatTime(result.startedAt)} />
              <MetaRow label="Request size" value={formatBytes(result.requestSize)} />
              <MetaRow label="Response size" value={formatBytes(result.responseSize)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
