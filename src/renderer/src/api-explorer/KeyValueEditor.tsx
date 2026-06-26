import { Plus, Trash2 } from 'lucide-react';

import { rowId } from './http-utils';

export interface KVRow {
  id: string;
  key: string;
  value: string;
  enabled?: boolean;
}

const inputCls =
  'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

/**
 * A reusable enabled/key/value row editor used by the Params tab and form-data /
 * x-www-form-urlencoded body modes. Disabled rows stay in the list but are excluded from requests.
 */
export function KeyValueEditor({
  rows,
  onChange,
  idPrefix,
  title,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  emptyHint,
}: {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  idPrefix: string;
  title: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  emptyHint?: string;
}): React.JSX.Element {
  const update = (id: string, patch: Partial<KVRow>): void =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (): void =>
    onChange([...rows, { id: rowId(idPrefix), key: '', value: '', enabled: true }]);
  const remove = (id: string): void => onChange(rows.filter((r) => r.id !== id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-faint">{title}</span>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-faint">{emptyHint ?? 'No rows yet.'}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={row.enabled ?? true}
                onChange={(e) => update(row.id, { enabled: e.target.checked })}
                title="Include this row"
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <input
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                placeholder={keyPlaceholder}
                spellCheck={false}
                className={`${inputCls} flex-1`}
              />
              <input
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
                placeholder={valuePlaceholder}
                spellCheck={false}
                className={`${inputCls} flex-[1.4]`}
              />
              <button
                type="button"
                onClick={() => remove(row.id)}
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
