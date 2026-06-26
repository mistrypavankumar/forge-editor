import { Plus, Trash2 } from 'lucide-react';

import type { HeaderRow } from './types';

import { isSensitiveHeader } from './graphql-utils';

const inputCls =
  'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

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
  const updateRow = (id: string, patch: Partial<HeaderRow>): void =>
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <input
                value={row.key}
                onChange={(e) => updateRow(row.id, { key: e.target.value })}
                placeholder="Header"
                spellCheck={false}
                className={`${inputCls} flex-1`}
              />
              <input
                type={isSensitiveHeader(row.key) ? 'password' : 'text'}
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                placeholder="Value"
                spellCheck={false}
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
  );
}
