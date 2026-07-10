import { useEffect, useMemo, useState } from 'react';
import {
  Bug,
  Trash2,
  FileCode2,
  Route,
  Copy,
  TerminalSquare,
  Search,
  Ban,
  AlertCircle,
  AlertTriangle,
  Info,
  Send,
  Sparkles,
  Network as NetworkIcon,
} from 'lucide-react';
import type { BrowserConsoleEvent, BrowserNetworkEvent, BrowserConsoleLevel } from '@shared/ipc-contract';
import { cn } from '../lib/cn';
import { useAiStore } from '../stores/ai-store';
import { Tabs } from '../components/ui/Tabs';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { useBrowserStore } from './store';
import {
  useBrowserDebugStore,
  consoleSignature,
  type ConsoleFilter,
} from './browser-debug-store';
import { toGraphQLEvent, redactHeaders, type BrowserGraphQLEvent } from './network';
import {
  openConsoleSource,
  openRouteFile,
  openNetworkRelated,
  gqlUsageFiles,
  openAt,
  copyText,
  copyCurl,
  searchInProject,
  sendToApiExplorer,
  askAiToFixConsole,
  askAiToFixNetwork,
  isAiConfigured,
} from './browser-debug-actions';

const SLOW_MS = 500;
/** Cap on rendered rows (events are already bounded by maxEvents; this bounds DOM nodes). */
const MAX_RENDER = 300;

type DebugSubTab = 'console' | 'network' | 'graphql';

/** Keep the most recent rows renderable; report how many older ones are hidden. */
function capRows<T>(list: T[]): { visible: T[]; hidden: number } {
  return list.length > MAX_RENDER
    ? { visible: list.slice(list.length - MAX_RENDER), hidden: list.length - MAX_RENDER }
    : { visible: list, hidden: 0 };
}

function HiddenBanner({ n }: { n: number }): React.JSX.Element {
  return (
    <div className="border-b border-line-soft px-2.5 py-1 text-center text-[10px] text-faint">
      {n} older event{n === 1 ? '' : 's'} hidden — clear or narrow filters to see more
    </div>
  );
}

/** Whether "Ask AI to Fix" should be offered — re-checked when the provider changes. */
function useAiReady(): boolean {
  const provider = useAiStore((s) => s.provider);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void isAiConfigured().then((r) => alive && setReady(r));
    return () => {
      alive = false;
    };
  }, [provider]);
  return ready;
}

const fmtTime = (ts: number): string => new Date(ts).toLocaleTimeString(undefined, { hour12: false });
const fmtDur = (ms: number | undefined): string =>
  ms == null ? '' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;

const LEVEL_ICON: Record<BrowserConsoleLevel, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  debug: Info,
};
const LEVEL_COLOR: Record<BrowserConsoleLevel, string> = {
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-faint',
  debug: 'text-faint',
};

function statusColor(status: number | undefined, error: string | undefined): string {
  if (error || status === 0 || status === undefined) return 'text-danger';
  if (status >= 500) return 'text-danger';
  if (status >= 400) return 'text-warning';
  if (status >= 300) return 'text-accent';
  return 'text-success';
}

export function BrowserDebugPanel(): React.JSX.Element {
  const [tab, setTab] = useState<DebugSubTab>('console');
  const consoleEvents = useBrowserDebugStore((s) => s.console);
  const network = useBrowserDebugStore((s) => s.network);
  const clearConsole = useBrowserDebugStore((s) => s.clearConsole);
  const clearNetwork = useBrowserDebugStore((s) => s.clearNetwork);

  const errorCount = useMemo(() => consoleEvents.filter((e) => e.level === 'error').length, [consoleEvents]);
  const gqlCount = useMemo(() => network.filter((n) => n.type === 'graphql').length, [network]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-soft px-2">
        <Tabs
          size="sm"
          items={[
            { id: 'console', label: 'Console', badge: errorCount },
            { id: 'network', label: 'Network', badge: network.length },
            { id: 'graphql', label: 'GraphQL', badge: gqlCount },
          ]}
          active={tab}
          onSelect={(id) => setTab(id as DebugSubTab)}
        />
        <div className="flex items-center gap-0.5">
          {tab === 'console' ? (
            <IconButton label="Clear console" className="h-6 w-6" onClick={clearConsole}>
              <Trash2 size={13} />
            </IconButton>
          ) : (
            <IconButton label="Clear network" className="h-6 w-6" onClick={clearNetwork}>
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'console' ? <ConsoleTab /> : null}
        {tab === 'network' ? <NetworkTab /> : null}
        {tab === 'graphql' ? <GraphQLTab /> : null}
      </div>
    </div>
  );
}

// ── Console ──────────────────────────────────────────────────────────────────

function ConsoleTab(): React.JSX.Element {
  const events = useBrowserDebugStore((s) => s.console);
  const filter = useBrowserDebugStore((s) => s.consoleFilter);
  const setFilter = useBrowserDebugStore((s) => s.setConsoleFilter);
  const currentRouteOnly = useBrowserDebugStore((s) => s.currentRouteOnly);
  const setCurrentRouteOnly = useBrowserDebugStore((s) => s.setCurrentRouteOnly);
  const hideIgnored = useBrowserDebugStore((s) => s.hideIgnored);
  const setHideIgnored = useBrowserDebugStore((s) => s.setHideIgnored);
  const ignored = useBrowserDebugStore((s) => s.ignored);
  const selectedId = useBrowserDebugStore((s) => s.selectedConsoleId);
  const select = useBrowserDebugStore((s) => s.selectConsole);
  const currentUrl = useBrowserStore((s) => s.currentUrl);

  const currentRoute = useMemo(() => {
    try {
      return currentUrl ? new URL(currentUrl).pathname : null;
    } catch {
      return null;
    }
  }, [currentUrl]);

  const shown = useMemo(
    () =>
      events.filter((e) => {
        if (filter === 'error' && e.level !== 'error') return false;
        if (filter === 'warning' && e.level !== 'warning') return false;
        if (filter === 'info' && e.level !== 'info' && e.level !== 'debug') return false;
        if (currentRouteOnly && currentRoute && e.routePath !== currentRoute) return false;
        if (hideIgnored && ignored.includes(consoleSignature(e))) return false;
        return true;
      }),
    [events, filter, currentRouteOnly, currentRoute, hideIgnored, ignored],
  );

  const selected = shown.find((e) => e.id === selectedId) ?? null;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Bug}
        title="No console output captured yet."
        hint="Errors, warnings and logs from the embedded browser appear here."
      />
    );
  }

  const filters: { id: ConsoleFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'error', label: 'Errors' },
    { id: 'warning', label: 'Warnings' },
    { id: 'info', label: 'Info' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line-soft px-2 py-1 text-[11px]">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              filter === f.id ? 'bg-surface-3 text-fg' : 'text-faint hover:text-fg',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-line" />
        <FilterToggle on={currentRouteOnly} onClick={() => setCurrentRouteOnly(!currentRouteOnly)}>
          Current route
        </FilterToggle>
        <FilterToggle on={hideIgnored} onClick={() => setHideIgnored(!hideIgnored)}>
          Hide ignored
        </FilterToggle>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {capRows(shown).hidden > 0 ? <HiddenBanner n={capRows(shown).hidden} /> : null}
          {capRows(shown).visible.map((e) => {
            const Icon = LEVEL_ICON[e.level];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => select(e.id === selectedId ? null : e.id)}
                className={cn(
                  'flex w-full items-start gap-2 border-b border-line-soft px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-2',
                  e.id === selectedId && 'bg-surface-2',
                )}
              >
                <Icon size={13} className={cn('mt-0.5 shrink-0', LEVEL_COLOR[e.level])} />
                <span className="min-w-0 flex-1 truncate font-mono text-fg/90">{e.message}</span>
                <span className="shrink-0 text-[10px] text-faint">{fmtTime(e.timestamp)}</span>
              </button>
            );
          })}
        </div>
        {selected ? <ConsoleDetail event={selected} /> : null}
      </div>
    </div>
  );
}

function ConsoleDetail({ event }: { event: BrowserConsoleEvent }): React.JSX.Element {
  const ignoreSimilar = useBrowserDebugStore((s) => s.ignoreSimilar);
  const aiReady = useAiReady();
  const [msg, setMsg] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    const r = await openConsoleSource(event);
    setMsg(r.opened ? null : 'No source file found for this error. Try rebuilding the Codebase Map.');
  };

  return (
    <div className="flex w-[46%] min-w-[280px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2 text-[12px]">
      <div className="flex flex-col gap-2 px-3 py-2">
        <DetailRow label="Message">
          <span className="whitespace-pre-wrap break-words font-mono">{event.message}</span>
        </DetailRow>
        {event.source?.fileName ? (
          <DetailRow label="Source">
            <span className="font-mono text-[11px]">
              {event.source.fileName}
              {event.source.lineNumber ? `:${event.source.lineNumber}` : ''}
              {event.source.columnNumber ? `:${event.source.columnNumber}` : ''}
            </span>
          </DetailRow>
        ) : null}
        {event.routePath ? <DetailRow label="Route">{event.routePath}</DetailRow> : null}
        <DetailRow label="Time">{new Date(event.timestamp).toLocaleString()}</DetailRow>
        {event.stack ? (
          <DetailRow label="Stack">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-bg/60 p-2 font-mono text-[11px] text-faint">
              {event.stack}
            </pre>
          </DetailRow>
        ) : null}
      </div>
      <ActionBar>
        <ActionButton icon={<FileCode2 size={13} />} label="Open Source" onClick={open} />
        <ActionButton
          icon={<Route size={13} />}
          label="Open Route File"
          onClick={() => void openRouteFile(event.routePath ?? event.url)}
        />
        <ActionButton icon={<Copy size={13} />} label="Copy" onClick={() => copyText(errorText(event))} />
        <ActionButton
          icon={<Search size={13} />}
          label="Search in Project"
          onClick={() => searchInProject(event.message.slice(0, 120))}
        />
        <ActionButton
          icon={<Ban size={13} />}
          label="Ignore Similar"
          onClick={() => ignoreSimilar(event)}
        />
        {aiReady ? (
          <ActionButton
            icon={<Sparkles size={13} />}
            label="Ask AI to Fix"
            onClick={() => void askAiToFixConsole(event)}
          />
        ) : null}
      </ActionBar>
      {msg ? <div className="px-3 py-2 text-[11px] text-warning">{msg}</div> : null}
    </div>
  );
}

function errorText(e: BrowserConsoleEvent): string {
  return [
    e.message,
    e.source?.fileName
      ? `\nSource: ${e.source.fileName}:${e.source.lineNumber ?? ''}:${e.source.columnNumber ?? ''}`
      : '',
    e.routePath ? `\nRoute: ${e.routePath}` : '',
    e.stack ? `\n\n${e.stack}` : '',
  ].join('');
}

// ── Network ──────────────────────────────────────────────────────────────────

function NetworkTab(): React.JSX.Element {
  const network = useBrowserDebugStore((s) => s.network);
  const selectedId = useBrowserDebugStore((s) => s.selectedNetworkId);
  const select = useBrowserDebugStore((s) => s.selectNetwork);
  const selected = network.find((n) => n.id === selectedId) ?? null;

  if (network.length === 0) {
    return (
      <EmptyState
        icon={NetworkIcon}
        title="No network activity captured yet."
        hint="fetch / XHR requests made by the embedded app appear here."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-surface text-faint">
            <tr className="border-b border-line-soft text-left">
              <th className="px-2 py-1 font-medium">Method</th>
              <th className="px-2 py-1 font-medium">Status</th>
              <th className="px-2 py-1 font-medium">URL</th>
              <th className="px-2 py-1 font-medium">Type</th>
              <th className="px-2 py-1 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {capRows(network).visible.map((n) => (
              <tr
                key={n.id}
                onClick={() => select(n.id === selectedId ? null : n.id)}
                className={cn(
                  'cursor-pointer border-b border-line-soft hover:bg-surface-2',
                  n.id === selectedId && 'bg-surface-2',
                )}
              >
                <td className="px-2 py-1 font-mono text-fg/80">{n.method.toUpperCase()}</td>
                <td className={cn('px-2 py-1 font-mono', statusColor(n.status, n.error))}>
                  {n.error ? 'ERR' : (n.status ?? '—')}
                </td>
                <td className="max-w-0 px-2 py-1">
                  <span className="block truncate font-mono text-fg/80" title={n.url}>
                    {shortUrl(n.url)}
                  </span>
                </td>
                <td className="px-2 py-1 text-faint">{n.type}</td>
                <td className="px-2 py-1 text-right text-faint">{fmtDur(n.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? <NetworkDetail event={selected} /> : null}
    </div>
  );
}

function NetworkDetail({ event }: { event: BrowserNetworkEvent }): React.JSX.Element {
  const aiReady = useAiReady();
  const redact = useBrowserDebugStore((s) => s.redactSensitiveHeaders);
  const reqHeaders = redactHeaders(event.requestHeaders, redact);
  const resHeaders = redactHeaders(event.responseHeaders, redact);
  return (
    <div className="flex w-[46%] min-w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2 text-[12px]">
      <div className="flex flex-col gap-2 px-3 py-2">
        <DetailRow label="URL">
          <span className="break-all font-mono text-[11px]">{event.url}</span>
        </DetailRow>
        <div className="flex gap-4">
          <DetailRow label="Method">{event.method.toUpperCase()}</DetailRow>
          <DetailRow label="Status">
            <span className={statusColor(event.status, event.error)}>
              {event.error ? 'Failed' : `${event.status ?? '—'} ${event.statusText ?? ''}`}
            </span>
          </DetailRow>
          <DetailRow label="Duration">{fmtDur(event.durationMs)}</DetailRow>
        </div>
        {event.error ? <div className="text-[11px] text-danger">{event.error}</div> : null}
        <HeaderBlock title="Request headers" headers={reqHeaders} />
        {event.requestBody ? <BodyBlock title="Request body" body={event.requestBody} /> : null}
        <HeaderBlock title="Response headers" headers={resHeaders} />
        {event.responseBody ? (
          <BodyBlock title="Response body" body={event.responseBody} truncated={event.responseTruncated} />
        ) : null}
      </div>
      <ActionBar>
        <ActionButton
          icon={<FileCode2 size={13} />}
          label="Open Related Source"
          onClick={() => void openNetworkRelated(event)}
        />
        <ActionButton
          icon={<Send size={13} />}
          label="Send to API Explorer"
          onClick={() => sendToApiExplorer(event)}
        />
        <ActionButton
          icon={<TerminalSquare size={13} />}
          label="Copy as cURL"
          onClick={() => copyCurl(event)}
        />
        <ActionButton
          icon={<Copy size={13} />}
          label="Copy URL"
          onClick={() => copyText(event.url)}
        />
        {aiReady ? (
          <ActionButton
            icon={<Sparkles size={13} />}
            label="Ask AI Why Failed"
            onClick={() => void askAiToFixNetwork(event)}
          />
        ) : null}
      </ActionBar>
    </div>
  );
}

// ── GraphQL ──────────────────────────────────────────────────────────────────

type GqlGroup = 'all' | 'query' | 'mutation' | 'failed' | 'slow';

function GraphQLTab(): React.JSX.Element {
  const network = useBrowserDebugStore((s) => s.network);
  const selectedId = useBrowserDebugStore((s) => s.selectedNetworkId);
  const select = useBrowserDebugStore((s) => s.selectNetwork);
  const [group, setGroup] = useState<GqlGroup>('all');

  const events = useMemo(
    () => network.map(toGraphQLEvent).filter((e): e is BrowserGraphQLEvent => e !== null),
    [network],
  );

  const shown = useMemo(
    () =>
      events.filter((e) => {
        if (group === 'failed') return e.failed;
        if (group === 'slow') return (e.durationMs ?? 0) > SLOW_MS;
        if (group === 'query') return e.operationType === 'query';
        if (group === 'mutation') return e.operationType === 'mutation';
        return true;
      }),
    [events, group],
  );

  const selected = events.find((e) => e.id === selectedId) ?? null;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={NetworkIcon}
        title="No GraphQL operations captured yet."
        hint="Requests to /graphql (or with a GraphQL-shaped body) appear here."
      />
    );
  }

  const groups: { id: GqlGroup; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'query', label: 'Queries' },
    { id: 'mutation', label: 'Mutations' },
    { id: 'failed', label: 'Failed' },
    { id: 'slow', label: 'Slow' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-line-soft px-2 py-1 text-[11px]">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              group === g.id ? 'bg-surface-3 text-fg' : 'text-faint hover:text-fg',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {capRows(shown).hidden > 0 ? <HiddenBanner n={capRows(shown).hidden} /> : null}
          {capRows(shown).visible.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => select(e.id === selectedId ? null : e.id)}
              className={cn(
                'flex w-full items-center gap-2 border-b border-line-soft px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-2',
                e.id === selectedId && 'bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase',
                  e.operationType === 'mutation'
                    ? 'bg-warning/15 text-warning'
                    : 'bg-accent/15 text-accent',
                )}
              >
                {e.operationType ?? 'op'}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-fg/90">
                {e.operationName ?? '(anonymous)'}
              </span>
              {e.failed ? <span className="shrink-0 text-[10px] text-danger">failed</span> : null}
              <span className="shrink-0 text-[10px] text-faint">{fmtDur(e.durationMs)}</span>
            </button>
          ))}
        </div>
        {selected ? <GraphQLDetail event={selected} /> : null}
      </div>
    </div>
  );
}

function GraphQLDetail({ event }: { event: BrowserGraphQLEvent }): React.JSX.Element {
  const network = useBrowserDebugStore((s) => s.network);
  const net = network.find((n) => n.id === event.networkId) ?? null;
  const aiReady = useAiReady();
  const [usedBy, setUsedBy] = useState<{ rel: string; path: string }[]>([]);

  useEffect(() => {
    let alive = true;
    void gqlUsageFiles(event.operationName).then((files) => {
      if (alive) setUsedBy(files);
    });
    return () => {
      alive = false;
    };
  }, [event.operationName]);

  return (
    <div className="flex w-[48%] min-w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2 text-[12px]">
      <div className="flex flex-col gap-2 px-3 py-2">
        <DetailRow label="Operation">
          <span className="font-mono">
            {event.operationName ?? '(anonymous)'}{' '}
            <span className="text-faint">· {event.operationType}</span>
            {event.batchSize ? <span className="text-faint"> · batch ×{event.batchSize}</span> : null}
          </span>
        </DetailRow>
        <div className="flex gap-4">
          <DetailRow label="Status">
            <span className={statusColor(event.status, net?.error)}>{event.status ?? '—'}</span>
          </DetailRow>
          <DetailRow label="Duration">{fmtDur(event.durationMs)}</DetailRow>
        </div>
        {event.routePath ? <DetailRow label="Route">{event.routePath}</DetailRow> : null}
        {event.variables !== undefined ? (
          <BodyBlock title="Variables" body={safeJson(event.variables)} />
        ) : null}
        {event.errors?.length ? (
          <DetailRow label="GraphQL errors">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/60 p-2 font-mono text-[11px] text-danger">
              {safeJson(event.errors)}
            </pre>
          </DetailRow>
        ) : null}
        {event.dataPreview !== undefined ? (
          <BodyBlock title="Response data" body={safeJson(event.dataPreview)} />
        ) : null}
        {usedBy.length ? (
          <DetailRow label={`Used by ${usedBy.length} file(s)`}>
            <div className="flex flex-col gap-0.5">
              {usedBy.map((u) => (
                <button
                  key={u.path}
                  type="button"
                  onClick={() => openAt(u.path, 1, 1)}
                  className="truncate text-left font-mono text-[11px] text-accent hover:underline"
                >
                  {u.rel}
                </button>
              ))}
            </div>
          </DetailRow>
        ) : null}
      </div>
      <ActionBar>
        <ActionButton
          icon={<FileCode2 size={13} />}
          label="Open GraphQL Operation"
          onClick={() => net && void openNetworkRelated(net)}
        />
        <ActionButton
          icon={<Send size={13} />}
          label="Send to API Explorer"
          onClick={() => net && sendToApiExplorer(net)}
        />
        <ActionButton
          icon={<TerminalSquare size={13} />}
          label="Copy as cURL"
          onClick={() => net && copyCurl(net)}
        />
        <ActionButton
          icon={<Copy size={13} />}
          label="Copy Query"
          onClick={() => copyText(event.query ?? '')}
        />
        {aiReady && net ? (
          <ActionButton
            icon={<Sparkles size={13} />}
            label="Ask AI Why Failed"
            onClick={() => void askAiToFixNetwork(net)}
          />
        ) : null}
      </ActionBar>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className="break-words text-fg/90">{children}</div>
    </div>
  );
}

function HeaderBlock({ title, headers }: { title: string; headers: Record<string, string> }): React.JSX.Element | null {
  const entries = Object.entries(headers);
  if (!entries.length) return null;
  return (
    <DetailRow label={title}>
      <div className="flex flex-col gap-0.5 font-mono text-[11px]">
        {entries.map(([k, v]) => (
          <div key={k} className="break-all">
            <span className="text-faint">{k}: </span>
            <span className="text-fg/80">{v}</span>
          </div>
        ))}
      </div>
    </DetailRow>
  );
}

function BodyBlock({ title, body, truncated }: { title: string; body: string; truncated?: boolean }): React.JSX.Element {
  return (
    <DetailRow label={truncated ? `${title} (truncated)` : title}>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-bg/60 p-2 font-mono text-[11px] text-fg/80">
        {body}
      </pre>
    </DetailRow>
  );
}

function ActionBar({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-auto flex flex-wrap gap-1 border-t border-line px-2 py-2">{children}</div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-fg transition-colors hover:bg-bg"
    >
      <span className="text-accent">{icon}</span>
      {label}
    </button>
  );
}

function FilterToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-1.5 py-0.5 transition-colors',
        on ? 'bg-accent/15 text-accent' : 'text-faint hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function safeJson(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
