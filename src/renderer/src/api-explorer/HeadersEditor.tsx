import { useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

import type { HeaderRow } from './types';

import { cn } from '../lib/cn';
import { isSensitiveHeader } from './graphql-utils';

const inputCls =
  'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

/** Common request header names, suggested as the user types the key. */
const COMMON_HEADERS = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'DNT',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-Api-Key',
  'X-CSRF-Token',
  'X-Forwarded-For',
  'X-Requested-With',
];

/** Common values suggested per header key, keyed by lowercased header name. */
const COMMON_HEADER_VALUES: Record<string, string[]> = {
  accept: [
    'application/json',
    'application/xml',
    'text/plain',
    'text/html',
    '*/*',
  ],
  'accept-encoding': ['gzip, deflate, br', 'gzip', 'identity'],
  'accept-language': ['en-US,en;q=0.9', 'en-US', 'en'],
  authorization: ['Bearer ', 'Basic '],
  'cache-control': ['no-cache', 'no-store', 'max-age=0'],
  connection: ['keep-alive', 'close'],
  'content-type': [
    'application/json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/html',
  ],
  dnt: ['1', '0'],
  'x-requested-with': ['XMLHttpRequest'],
};

/**
 * Custom request headers. Authorization is handled separately by the Auth tab. Values for
 * sensitive keys (authorization, cookie, x-api-key, …) render masked.
 */
export function HeadersEditor({
  rows,
  onRowsChange,
}: {
  rows: HeaderRow[];
  onRowsChange: (rows: HeaderRow[]) => void;
}): React.JSX.Element {
  // Row ids whose masked value is currently revealed.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  // Row id whose key input is focused (drives its suggestion dropdown), plus the highlighted item.
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [keyHighlight, setKeyHighlight] = useState(-1);
  // Row id whose value input is focused (drives its suggestion dropdown), plus the highlighted item.
  const [activeValueId, setActiveValueId] = useState<string | null>(null);
  const [valueHighlight, setValueHighlight] = useState(-1);
  const toggleReveal = (id: string): void =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const updateRow = (id: string, patch: Partial<HeaderRow>): void =>
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Suggestions for the focused key input: common headers matching the input, minus keys
  // already present on other rows and any exact match of the current input.
  const activeRow = rows.find((r) => r.id === activeKeyId);
  const keySuggestions = useMemo(() => {
    if (!activeRow) return [];
    const q = activeRow.key.trim().toLowerCase();
    const used = new Set(
      rows.filter((r) => r.id !== activeKeyId).map((r) => r.key.trim().toLowerCase()),
    );
    return COMMON_HEADERS.filter(
      (h) => !used.has(h.toLowerCase()) && h.toLowerCase() !== q && (!q || h.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [activeRow, activeKeyId, rows]);

  // Suggestions for the focused value input: common values for that row's header key, filtered
  // by what's typed so far (minus any exact match).
  const activeValueRow = rows.find((r) => r.id === activeValueId);
  const valueSuggestions = useMemo(() => {
    if (!activeValueRow) return [];
    const candidates = COMMON_HEADER_VALUES[activeValueRow.key.trim().toLowerCase()];
    if (!candidates) return [];
    const q = activeValueRow.value.trim().toLowerCase();
    return candidates
      .filter((v) => v.toLowerCase() !== q && (!q || v.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [activeValueRow, activeValueId, rows]);
  const addRow = (): void =>
    onRowsChange([...rows, { id: `hdr-${Date.now()}-${rows.length}`, key: '', value: '' }]);
  const removeRow = (id: string): void => onRowsChange(rows.filter((r) => r.id !== id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
          Custom headers
        </span>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-faint">No custom headers. They merge onto the request.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const sensitive = isSensitiveHeader(row.key);
            const masked = sensitive && !revealed.has(row.id);
            return (
            <div key={row.id} className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  value={row.key}
                  onChange={(e) => {
                    updateRow(row.id, { key: e.target.value });
                    setKeyHighlight(-1);
                  }}
                  onFocus={() => {
                    setActiveKeyId(row.id);
                    setKeyHighlight(-1);
                  }}
                  onBlur={() => setActiveKeyId((id) => (id === row.id ? null : id))}
                  onKeyDown={(e) => {
                    if (activeKeyId !== row.id || keySuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setKeyHighlight((h) => (h + 1) % keySuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setKeyHighlight((h) => (h <= 0 ? keySuggestions.length - 1 : h - 1));
                    } else if ((e.key === 'Enter' || e.key === 'Tab') && keyHighlight >= 0) {
                      e.preventDefault();
                      updateRow(row.id, { key: keySuggestions[keyHighlight] });
                      setActiveKeyId(null);
                    } else if (e.key === 'Escape') {
                      setActiveKeyId(null);
                    }
                  }}
                  placeholder="Header"
                  spellCheck={false}
                  autoComplete="off"
                  className={`${inputCls} w-full`}
                />
                {activeKeyId === row.id && keySuggestions.length > 0 ? (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-elevated py-1 shadow-lg">
                    {keySuggestions.map((h, i) => (
                      <li key={h}>
                        <div
                          role="option"
                          aria-selected={i === keyHighlight}
                          // onMouseDown (not onClick) so the pick fires before the input's onBlur.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateRow(row.id, { key: h });
                            setActiveKeyId(null);
                          }}
                          onMouseEnter={() => setKeyHighlight(i)}
                          className={cn(
                            'cursor-pointer px-2.5 py-1.5 text-[12px]',
                            i === keyHighlight ? 'bg-surface-2 text-fg' : 'text-muted',
                          )}
                        >
                          {h}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="relative flex-[1.4]">
                <input
                  type={masked ? 'password' : 'text'}
                  value={row.value}
                  onChange={(e) => {
                    updateRow(row.id, { value: e.target.value });
                    setValueHighlight(-1);
                  }}
                  onFocus={() => {
                    setActiveValueId(row.id);
                    setValueHighlight(-1);
                  }}
                  onBlur={() => setActiveValueId((id) => (id === row.id ? null : id))}
                  onKeyDown={(e) => {
                    if (activeValueId !== row.id || valueSuggestions.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setValueHighlight((h) => (h + 1) % valueSuggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setValueHighlight((h) => (h <= 0 ? valueSuggestions.length - 1 : h - 1));
                    } else if ((e.key === 'Enter' || e.key === 'Tab') && valueHighlight >= 0) {
                      e.preventDefault();
                      updateRow(row.id, { value: valueSuggestions[valueHighlight] });
                      setActiveValueId(null);
                    } else if (e.key === 'Escape') {
                      setActiveValueId(null);
                    }
                  }}
                  placeholder="Value"
                  spellCheck={false}
                  autoComplete="off"
                  className={`${inputCls} w-full ${sensitive ? 'pr-7' : ''}`}
                />
                {sensitive && (
                  <button
                    type="button"
                    onClick={() => toggleReveal(row.id)}
                    title={masked ? 'Show value' : 'Hide value'}
                    className="absolute inset-y-0 right-1 flex items-center rounded px-0.5 text-faint hover:text-fg"
                  >
                    {masked ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
                {activeValueId === row.id && valueSuggestions.length > 0 ? (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-elevated py-1 shadow-lg">
                    {valueSuggestions.map((v, i) => (
                      <li key={v}>
                        <div
                          role="option"
                          aria-selected={i === valueHighlight}
                          // onMouseDown (not onClick) so the pick fires before the input's onBlur.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateRow(row.id, { value: v });
                            setActiveValueId(null);
                          }}
                          onMouseEnter={() => setValueHighlight(i)}
                          className={cn(
                            'cursor-pointer px-2.5 py-1.5 text-[12px]',
                            i === valueHighlight ? 'bg-surface-2 text-fg' : 'text-muted',
                          )}
                        >
                          {v}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
              >
                <Trash2 size={13} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
