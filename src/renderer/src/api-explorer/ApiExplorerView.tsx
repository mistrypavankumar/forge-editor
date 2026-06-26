import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Wand2, Copy, SquareTerminal, Loader2 } from 'lucide-react';

import type { HeaderRow, ExecutionResult } from './types';

import { cn } from '../lib/cn';
import { Sidebar } from './Sidebar';
import { runGraphQL } from './runner';
import { MonacoMini } from './MonacoMini';
import { ResponseTabs } from './ResponseTabs';
import { HeadersEditor } from './HeadersEditor';
import { useApiExplorerStore } from './store';
import { useLayoutStore } from '../stores/layout-store';
import {
  prettyJson,
  formatGraphql,
  parseVariables,
  validateGraphql,
  summarizeResponse,
  detectOperationType,
  extractOperationName,
} from './graphql-utils';

type MiddleTab = 'variables' | 'headers';

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

/**
 * The API Explorer — a Postman-style GraphQL playground rendered as a full overlay. Read-only
 * by default (mutations require disabling it + confirming). Runs against any endpoint using an
 * optional bearer token and custom headers; the request executes in the main process (no CORS).
 */
export function ApiExplorerView(): React.JSX.Element | null {
  const open = useLayoutStore((s) => s.apiExplorerOpen);
  const close = useCallback(() => useLayoutStore.getState().setApiExplorerOpen(false), []);

  const endpoint = useApiExplorerStore((s) => s.endpoint);
  const token = useApiExplorerStore((s) => s.token);
  const headers = useApiExplorerStore((s) => s.headers);
  const readOnly = useApiExplorerStore((s) => s.readOnly);
  const query = useApiExplorerStore((s) => s.query);
  const variables = useApiExplorerStore((s) => s.variables);

  const [middleTab, setMiddleTab] = useState<MiddleTab>('variables');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [varsError, setVarsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [confirmMutation, setConfirmMutation] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const headersRecord = useMemo(() => rowsToHeaders(headers), [headers]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !confirmMutation) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmMutation, close]);

  const execute = useCallback(async () => {
    const parsedVars = parseVariables(variables);
    if (!parsedVars.ok) {
      setVarsError(parsedVars.error);
      setMiddleTab('variables');
      return;
    }
    setRunning(true);
    setResult(null);
    const operationName = extractOperationName(query);
    const res = await runGraphQL({
      endpoint,
      query,
      variables: parsedVars.value,
      operationName,
      token,
      headers: headersRecord,
    });
    setRunning(false);
    setResult(res);
    useApiExplorerStore.getState().addHistory({
      operationName,
      operationType: res.operationType,
      status: res.ok ? 'success' : 'error',
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
      query,
      variables,
      responseSummary: summarizeResponse({
        httpStatus: res.httpStatus,
        errorCount: res.errors?.length ?? 0,
        networkError: res.networkError,
      }),
    });
  }, [variables, query, endpoint, token, headersRecord]);

  const attemptRun = useCallback(() => {
    if (running) return;
    if (!endpoint.trim()) {
      flash('Enter a GraphQL endpoint URL.');
      return;
    }
    const valid = validateGraphql(query);
    if (!valid.ok) {
      setQueryError(valid.error);
      return;
    }
    setQueryError(null);

    const opType = detectOperationType(query);
    if (opType === 'subscription') {
      flash('Subscriptions are not supported in the API Explorer.');
      return;
    }
    if (opType === 'mutation') {
      if (readOnly) {
        flash('Mutations are disabled in read-only mode.');
        return;
      }
      setConfirmMutation(true);
      return;
    }
    void execute();
  }, [running, endpoint, query, readOnly, execute, flash]);

  const insertOperation = useCallback((nextQuery: string, nextVariables: string) => {
    useApiExplorerStore.getState().loadOperation(nextQuery, nextVariables);
    setQueryError(null);
    setVarsError(null);
    setResult(null);
  }, []);

  const formatQuery = useCallback(() => {
    const r = formatGraphql(query);
    if (r.ok) {
      useApiExplorerStore.getState().setQuery(r.value);
      setQueryError(null);
    } else setQueryError(r.error);
  }, [query]);

  const formatVars = useCallback(() => {
    const r = prettyJson(variables);
    if (r.ok) {
      useApiExplorerStore.getState().setVariables(r.value);
      setVarsError(null);
    } else setVarsError(r.error);
  }, [variables]);

  const toggleReadOnly = useCallback(() => {
    useApiExplorerStore.getState().setReadOnly(!readOnly);
  }, [readOnly]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="flex h-[88vh] max-h-[900px] w-[min(1200px,95vw)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
              <SquareTerminal size={16} />
            </div>
            <div>
              <div className="text-[14px] font-semibold leading-tight text-fg">API Explorer</div>
              <div className="text-[11px] text-faint">Run GraphQL queries &amp; inspect responses</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleReadOnly}
              className="flex items-center gap-1.5"
              title={readOnly ? 'Read-only blocks mutations' : 'Mutations allowed'}
            >
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  readOnly ? 'bg-emerald-500' : 'bg-surface-3',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    readOnly ? 'translate-x-[18px]' : 'translate-x-0.5',
                  )}
                />
              </span>
              <span className="text-[12px] font-semibold text-fg">Read-only</span>
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <input
            value={endpoint}
            onChange={(e) => useApiExplorerStore.getState().setEndpoint(e.target.value)}
            placeholder="https://…/graphql"
            spellCheck={false}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12.5px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70"
          />
          <button
            type="button"
            onClick={attemptRun}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        {notice ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[12px] text-amber-300">
            {notice}
          </div>
        ) : null}

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="hidden w-64 shrink-0 flex-col border-r border-line sm:flex">
            <Sidebar
              endpoint={endpoint}
              token={token}
              headers={headersRecord}
              onInsertOperation={insertOperation}
            />
          </div>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Query + middle tabs */}
            <div className="flex min-h-0 flex-col" style={{ flex: '0 0 56%' }}>
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Query</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={formatQuery}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Wand2 size={13} /> Format
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(query).catch(() => undefined)}
                    className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
                    title="Copy query"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 px-2 pt-1">
                <div className="h-full overflow-hidden rounded-lg border border-line">
                  <MonacoMini
                    value={query}
                    onChange={(v) => {
                      useApiExplorerStore.getState().setQuery(v);
                      if (queryError) setQueryError(null);
                    }}
                    language="graphql"
                    onRun={attemptRun}
                  />
                </div>
              </div>
              <div className="px-3 pt-0.5 text-[10.5px] text-faint">
                {queryError ? <span className="text-red-400">{queryError}</span> : '⌘/Ctrl + Enter to run · Format prettifies & validates.'}
              </div>

              {/* Variables / Headers */}
              <div className="flex items-center gap-1 px-2 pt-1">
                {(['variables', 'headers'] as MiddleTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMiddleTab(t)}
                    className={cn(
                      'rounded-md px-2 py-1 text-[12px] capitalize',
                      middleTab === t ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {t}
                  </button>
                ))}
                {middleTab === 'variables' ? (
                  <button
                    type="button"
                    onClick={formatVars}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Wand2 size={13} /> Format
                  </button>
                ) : null}
              </div>
              <div className="px-2 pb-2" style={{ height: 150 }}>
                {middleTab === 'variables' ? (
                  <div className="h-full overflow-hidden rounded-lg border border-line">
                    <MonacoMini
                      value={variables}
                      onChange={(v) => {
                        useApiExplorerStore.getState().setVariables(v);
                        if (varsError) setVarsError(null);
                      }}
                      language="json"
                      onRun={attemptRun}
                    />
                  </div>
                ) : (
                  <div className="h-full overflow-auto rounded-lg border border-line p-2.5">
                    <HeadersEditor
                      token={token}
                      onTokenChange={(t) => useApiExplorerStore.getState().setToken(t)}
                      rows={headers}
                      onRowsChange={(r) => useApiExplorerStore.getState().setHeaders(r)}
                    />
                  </div>
                )}
              </div>
              {middleTab === 'variables' && varsError ? (
                <div className="px-3 pb-1 text-[10.5px] text-red-400">{varsError}</div>
              ) : null}
            </div>

            {/* Response */}
            <div className="min-h-0 flex-1 border-t border-line">
              <ResponseTabs result={result} running={running} />
            </div>
          </div>
        </div>
      </div>

      {/* Mutation confirmation */}
      {confirmMutation ? (
        <div
          className="fixed inset-0 z-[3100] grid place-items-center bg-black/50"
          onMouseDown={(e) => {
            e.stopPropagation();
            setConfirmMutation(false);
          }}
        >
          <div
            className="w-[min(420px,92vw)] rounded-xl border border-line-strong bg-elevated p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold text-fg">Run mutation?</div>
            <p className="mt-2 text-[13px] leading-snug text-muted">
              You are about to run a mutation using your current session. This may change data.
              Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmMutation(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-fg hover:border-line-strong"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmMutation(false);
                  void execute();
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12.5px] font-semibold text-black hover:opacity-90"
              >
                Run mutation
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
