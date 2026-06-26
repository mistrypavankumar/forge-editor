import { useMemo, useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';

import type { ExecutionResult } from './types';

import { cn } from '../lib/cn';
import { formatTime, formatBytes } from './graphql-utils';

type ResponseTab = 'pretty' | 'raw' | 'headers' | 'errors' | 'metadata';

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

function CodeBlock({ text }: { text: string }): React.JSX.Element {
  return (
    <pre className="m-0 h-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface/50 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
      {text}
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
    <div className="flex h-full min-h-0 flex-col">
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

      <div className="min-h-0 flex-1 overflow-auto p-2">
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
            <CodeBlock text={prettyText} />
          ) : (
            <div className="grid h-full place-items-center text-[12px] text-faint">No data in the response.</div>
          )
        ) : tab === 'raw' ? (
          result.raw ? (
            <CodeBlock text={result.raw} />
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
  );
}
