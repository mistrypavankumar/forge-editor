import { Plus, Trash2 } from 'lucide-react';

import type { HeaderRow } from './types';

import { isSensitiveHeader } from './graphql-utils';

const inputCls =
  'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

/**
 * Auth + custom headers. The bearer token is held in memory only (never persisted) and sent as
 * `Authorization: Bearer <token>`. Custom header values for sensitive keys render masked.
 */
export function HeadersEditor({
  token,
  onTokenChange,
  rows,
  onRowsChange,
}: {
  token: string;
  onTokenChange: (token: string) => void;
  rows: HeaderRow[];
  onRowsChange: (rows: HeaderRow[]) => void;
}): React.JSX.Element {
  const updateRow = (id: string, patch: Partial<HeaderRow>): void =>
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = (): void =>
    onRowsChange([...rows, { id: `hdr-${Date.now()}-${rows.length}`, key: '', value: '' }]);
  const removeRow = (id: string): void => onRowsChange(rows.filter((r) => r.id !== id));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">
          Authorization
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-muted">Bearer</span>
          <input
            type="password"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="paste access token (kept in memory only)"
            className={`${inputCls} flex-1`}
          />
        </div>
        <div className="mt-1 text-[10.5px] text-faint">
          Sent as <span className="font-mono">Authorization: Bearer …</span>. Not saved to disk —
          cleared when Forge restarts.
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
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
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5">
                <input
                  value={row.key}
                  onChange={(e) => updateRow(row.id, { key: e.target.value })}
                  placeholder="Header"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type={isSensitiveHeader(row.key) ? 'password' : 'text'}
                  value={row.value}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                  placeholder="Value"
                  className={`${inputCls} flex-[1.4]`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
