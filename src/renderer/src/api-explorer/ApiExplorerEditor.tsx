import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, Wand2, Copy, Loader2 } from 'lucide-react';

import type { HeaderRow, BodyMode, ExecutionResult, HttpMethod, ParamRow, FormRow } from './types';
import { UNSAFE_METHODS } from './types';

import { cn } from '../lib/cn';
import { Sidebar } from './Sidebar';
import { runHttp } from './runner';
import { MonacoMini } from './MonacoMini';
import { AuthEditor } from './AuthEditor';
import { ResponseTabs } from './ResponseTabs';
import { HeadersEditor } from './HeadersEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { useApiExplorerStore } from './store';
import { buildUrl, parseQueryParams, splitUrl } from './http-utils';
import {
  prettyJson,
  formatGraphql,
  parseVariables,
  validateGraphql,
  summarizeResponse,
  detectOperationType,
  extractOperationName,
} from './graphql-utils';

type RequestTab = 'params' | 'auth' | 'headers' | 'body';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const BODY_MODES: { id: BodyMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'xml', label: 'XML' },
  { id: 'form', label: 'Form-data' },
  { id: 'urlencoded', label: 'x-www-form-urlencoded' },
  { id: 'graphql', label: 'GraphQL' },
];

const selectCls =
  'rounded-lg border border-line bg-surface px-2 py-1.5 text-[12.5px] font-semibold text-fg outline-none transition-colors focus:border-accent/70';

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

/** Compact short label for the history list / response: the URL path, host-relative. */
function shortLabel(url: string): string {
  const base = splitUrl(url).base;
  return base.replace(/^https?:\/\//, '') || base || 'request';
}

/**
 * The API Explorer — a Postman-style HTTP client rendered inside an editor tab. Supports REST
 * (method + params + auth + body modes) and GraphQL (as one body mode, with the schema/templates
 * sidebar). Read-only by default: unsafe methods / mutations require disabling it + confirming.
 * Requests execute in the main process (no CORS).
 */
export function ApiExplorerEditor(): React.JSX.Element {
  const method = useApiExplorerStore((s) => s.method);
  const url = useApiExplorerStore((s) => s.url);
  const params = useApiExplorerStore((s) => s.params);
  const auth = useApiExplorerStore((s) => s.auth);
  const headers = useApiExplorerStore((s) => s.headers);
  const bodyMode = useApiExplorerStore((s) => s.bodyMode);
  const bodyText = useApiExplorerStore((s) => s.bodyText);
  const formRows = useApiExplorerStore((s) => s.formRows);
  const readOnly = useApiExplorerStore((s) => s.readOnly);
  const query = useApiExplorerStore((s) => s.query);
  const variables = useApiExplorerStore((s) => s.variables);

  const [requestTab, setRequestTab] = useState<RequestTab>('body');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [varsError, setVarsError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isGraphql = bodyMode === 'graphql';
  const headersRecord = useMemo(() => rowsToHeaders(headers), [headers]);
  const bearerForSchema = auth.type === 'bearer' ? auth.token : undefined;

  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const store = useApiExplorerStore.getState;

  // Two-way URL ⇄ params sync.
  const onUrlChange = useCallback(
    (raw: string) => {
      store().setUrl(raw);
      store().setParams(parseQueryParams(raw));
    },
    [store],
  );
  const onParamsChange = useCallback(
    (rows: ParamRow[]) => {
      store().setParams(rows);
      store().setUrl(buildUrl(url, rows));
    },
    [store, url],
  );

  const execute = useCallback(async () => {
    let parsedVars: Record<string, unknown> | undefined;
    if (isGraphql) {
      const pv = parseVariables(variables);
      if (!pv.ok) {
        setVarsError(pv.error);
        setRequestTab('body');
        return;
      }
      parsedVars = pv.value;
    }
    setRunning(true);
    setResult(null);
    const operationName = isGraphql ? extractOperationName(query) : '';
    const res = await runHttp({
      method,
      url,
      auth,
      headers: headersRecord,
      bodyMode,
      bodyText,
      formRows,
      query,
      variables: parsedVars,
      operationName,
    });
    setRunning(false);
    setResult(res);
    store().addHistory({
      label: isGraphql ? operationName : shortLabel(res.url),
      method: res.method,
      url: res.url,
      bodyMode,
      status: res.ok ? 'success' : 'error',
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
      query,
      variables,
      bodyText,
      responseSummary: summarizeResponse({
        httpStatus: res.httpStatus,
        errorCount: res.errors?.length ?? 0,
        networkError: res.networkError,
      }),
    });
  }, [isGraphql, variables, query, method, url, auth, headersRecord, bodyMode, bodyText, formRows, store]);

  const attemptRun = useCallback(() => {
    if (running) return;
    if (!url.trim()) {
      flash('Enter a request URL.');
      return;
    }

    if (isGraphql) {
      const valid = validateGraphql(query);
      if (!valid.ok) {
        setQueryError(valid.error);
        setRequestTab('body');
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
        setConfirmRun(true);
        return;
      }
      void execute();
      return;
    }

    // REST: guard state-changing methods.
    if (UNSAFE_METHODS.has(method)) {
      if (readOnly) {
        flash(`${method} is disabled in read-only mode.`);
        return;
      }
      setConfirmRun(true);
      return;
    }
    void execute();
  }, [running, url, isGraphql, query, readOnly, method, execute, flash]);

  // Esc cancels the confirm dialog.
  useEffect(() => {
    if (!confirmRun) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setConfirmRun(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmRun]);

  const insertOperation = useCallback(
    (nextQuery: string, nextVariables: string) => {
      store().loadOperation(nextQuery, nextVariables);
      setRequestTab('body');
      setQueryError(null);
      setVarsError(null);
      setResult(null);
    },
    [store],
  );

  const formatQuery = useCallback(() => {
    const r = formatGraphql(query);
    if (r.ok) {
      store().setQuery(r.value);
      setQueryError(null);
    } else setQueryError(r.error);
  }, [query, store]);

  const formatVars = useCallback(() => {
    const r = prettyJson(variables);
    if (r.ok) {
      store().setVariables(r.value);
      setVarsError(null);
    } else setVarsError(r.error);
  }, [variables, store]);

  const formatBody = useCallback(() => {
    const r = prettyJson(bodyText);
    if (r.ok) {
      store().setBodyText(r.value);
      setBodyError(null);
    } else setBodyError(r.error);
  }, [bodyText, store]);

  const renderBody = (): React.JSX.Element => {
    if (bodyMode === 'none') {
      return (
        <div className="grid h-full place-items-center text-[12px] text-faint">
          This request has no body.
        </div>
      );
    }
    if (bodyMode === 'graphql') {
      return (
        <div className="flex h-full min-h-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Query</span>
            <button
              type="button"
              onClick={formatQuery}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Wand2 size={13} /> Format
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
            <MonacoMini
              value={query}
              onChange={(v) => {
                store().setQuery(v);
                if (queryError) setQueryError(null);
              }}
              language="graphql"
              onRun={attemptRun}
            />
          </div>
          {queryError ? <div className="text-[10.5px] text-red-400">{queryError}</div> : null}
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
              Variables
            </span>
            <button
              type="button"
              onClick={formatVars}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Wand2 size={13} /> Format
            </button>
          </div>
          <div className="h-[120px] shrink-0 overflow-hidden rounded-lg border border-line">
            <MonacoMini
              value={variables}
              onChange={(v) => {
                store().setVariables(v);
                if (varsError) setVarsError(null);
              }}
              language="json"
              onRun={attemptRun}
            />
          </div>
          {varsError ? <div className="text-[10.5px] text-red-400">{varsError}</div> : null}
        </div>
      );
    }
    if (bodyMode === 'json') {
      return (
        <div className="flex h-full min-h-0 flex-col gap-1.5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={formatBody}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Wand2 size={13} /> Format
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
            <MonacoMini
              value={bodyText}
              onChange={(v) => {
                store().setBodyText(v);
                if (bodyError) setBodyError(null);
              }}
              language="json"
              onRun={attemptRun}
            />
          </div>
          {bodyError ? <div className="text-[10.5px] text-red-400">{bodyError}</div> : null}
        </div>
      );
    }
    if (bodyMode === 'text' || bodyMode === 'xml') {
      return (
        <textarea
          value={bodyText}
          onChange={(e) => store().setBodyText(e.target.value)}
          spellCheck={false}
          placeholder={bodyMode === 'xml' ? '<root>…</root>' : 'Request body'}
          className="h-full w-full resize-none rounded-lg border border-line bg-surface p-2.5 font-mono text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent/70"
        />
      );
    }
    // form / urlencoded
    return (
      <div className="overflow-auto">
        <KeyValueEditor
          rows={formRows}
          onChange={(rows) => store().setFormRows(rows as FormRow[])}
          idPrefix="form"
          title={bodyMode === 'form' ? 'Form data' : 'Form fields'}
          emptyHint="No fields yet."
        />
      </div>
    );
  };

  const confirmLabel = isGraphql ? 'Run mutation?' : `Send ${method} request?`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* URL bar */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <select
          value={isGraphql ? 'POST' : method}
          disabled={isGraphql}
          onChange={(e) => store().setMethod(e.target.value as HttpMethod)}
          title={isGraphql ? 'GraphQL requests are always POST' : 'HTTP method'}
          className={cn(selectCls, 'shrink-0', isGraphql && 'opacity-60')}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://api.example.com/…"
          spellCheck={false}
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12.5px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70"
        />
        <button
          type="button"
          onClick={attemptRun}
          disabled={running}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {running ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => store().setReadOnly(!readOnly)}
          className="flex shrink-0 items-center gap-1.5"
          title={readOnly ? 'Read-only blocks state-changing requests' : 'State-changing requests allowed'}
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
      </div>

      {notice ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[12px] text-amber-300">
          {notice}
        </div>
      ) : null}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-line lg:flex">
          <Sidebar
            endpoint={url}
            token={bearerForSchema}
            headers={headersRecord}
            onInsertOperation={insertOperation}
          />
        </div>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Request section */}
          <div className="flex min-h-0 flex-col" style={{ flex: '0 0 50%' }}>
            <div className="flex items-center gap-1 border-b border-line px-2 pt-1">
              {(['params', 'auth', 'headers', 'body'] as RequestTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRequestTab(t)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[12px] capitalize',
                    requestTab === t ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {t}
                  {t === 'params' && params.some((p) => (p.enabled ?? true) && p.key.trim())
                    ? ` (${params.filter((p) => (p.enabled ?? true) && p.key.trim()).length})`
                    : ''}
                </button>
              ))}
              {requestTab === 'body' ? (
                <div className="ml-auto flex items-center gap-1.5 pr-1">
                  <span className="text-[11px] text-faint">Mode</span>
                  <select
                    value={bodyMode}
                    onChange={(e) => store().setBodyMode(e.target.value as BodyMode)}
                    className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-fg outline-none focus:border-accent/70"
                  >
                    {BODY_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {requestTab === 'params' ? (
                <KeyValueEditor
                  rows={params}
                  onChange={(rows) => onParamsChange(rows as ParamRow[])}
                  idPrefix="p"
                  title="Query params"
                  emptyHint="No query params. Add rows or type them into the URL."
                />
              ) : requestTab === 'auth' ? (
                <AuthEditor auth={auth} onChange={(a) => store().setAuth(a)} />
              ) : requestTab === 'headers' ? (
                <HeadersEditor rows={headers} onRowsChange={(r) => store().setHeaders(r)} />
              ) : (
                renderBody()
              )}
            </div>
            <div className="px-3 pb-1 text-[10.5px] text-faint">
              ⌘/Ctrl + Enter to send · secrets are kept in memory only.
            </div>
          </div>

          {/* Response */}
          <div className="min-h-0 flex-1 border-t border-line">
            <ResponseTabs result={result} running={running} />
          </div>
        </div>
      </div>

      {/* Run confirmation (state-changing request) */}
      {confirmRun
        ? createPortal(
            <div
              className="fixed inset-0 z-[3100] grid place-items-center bg-black/50"
              onMouseDown={() => setConfirmRun(false)}
            >
              <div
                className="w-[min(420px,92vw)] rounded-xl border border-line-strong bg-elevated p-5 shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="text-[15px] font-semibold text-fg">{confirmLabel}</div>
                <p className="mt-2 text-[13px] leading-snug text-muted">
                  You are about to send a state-changing request to{' '}
                  <span className="font-mono text-fg">{splitUrl(url).base}</span>. This may change
                  data. Continue?
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRun(false)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-fg hover:border-line-strong"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRun(false);
                      void execute();
                    }}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12.5px] font-semibold text-black hover:opacity-90"
                  >
                    {isGraphql ? 'Run mutation' : `Send ${method}`}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
