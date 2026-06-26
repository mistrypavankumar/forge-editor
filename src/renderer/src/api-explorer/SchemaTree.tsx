import { useMemo, useState, useCallback } from 'react';
import { Plus, RefreshCw, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';

import type { SchemaField, SchemaArgNode } from './types';

import { cn } from '../lib/cn';
import { buildOperation, listOperations, useGraphqlSchema } from './schema';

type OperationKind = 'query' | 'mutation';

function ArgNodeRow({ node, depth }: { node: SchemaArgNode; depth: number }): React.JSX.Element {
  const hasChildren = Boolean(node.children?.length);
  const [open, setOpen] = useState(depth === 0);

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded py-0.5 hover:bg-surface-2"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((v) => !v)}
          className={cn('grid w-3.5 shrink-0 place-items-center text-faint', !hasChildren && 'invisible')}
        >
          <ChevronRight size={11} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <span className="font-mono text-[11.5px] text-fg">
          {node.name}
          {node.required ? '!' : ''}
        </span>
        <span className="font-mono text-[10.5px] text-faint">{node.typeString}</span>
        <span className="ml-0.5 text-[8.5px] font-bold tracking-wide text-amber-400/80">ARG</span>
      </div>
      {hasChildren && open ? (
        <div>
          {node.children?.map((child) => (
            <ArgNodeRow key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldRow({
  field,
  kind,
  onInsert,
}: {
  field: SchemaField;
  kind: OperationKind;
  onInsert: (kind: OperationKind, name: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const hasArgs = field.args.length > 0;

  return (
    <div className="rounded-md hover:bg-surface-2/60">
      <div className="flex items-start gap-1 px-1.5 py-1">
        <button
          type="button"
          onClick={() => hasArgs && setOpen((v) => !v)}
          className={cn('mt-0.5 grid w-3.5 shrink-0 place-items-center text-faint', !hasArgs && 'invisible')}
        >
          <ChevronRight size={12} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => onInsert(kind, field.name)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="font-mono text-[12px] font-semibold text-fg">{field.name}</span>{' '}
          <span className="font-mono text-[10.5px] text-faint">{field.typeString}</span>
          {field.description ? (
            <span className="mt-0.5 block text-[10.5px] text-muted">{field.description}</span>
          ) : null}
        </button>
        <button
          type="button"
          title="Insert operation into editor"
          onClick={() => onInsert(kind, field.name)}
          className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
        >
          <Plus size={13} />
        </button>
      </div>
      {hasArgs && open ? (
        <div className="pb-1 pl-5 pr-2">
          {field.args.map((arg) => (
            <ArgNodeRow key={arg.name} node={arg} depth={0} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Group({
  label,
  fields,
  kind,
  onInsert,
}: {
  label: string;
  fields: SchemaField[];
  kind: OperationKind;
  onInsert: (kind: OperationKind, name: string) => void;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(true);
  if (fields.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sticky top-0 z-10 flex w-full items-center gap-1 bg-elevated px-1.5 py-1 text-left"
      >
        <ChevronRight size={13} className={cn('text-faint transition-transform', open && 'rotate-90')} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-fg">{label}</span>
        <span className="text-[11px] text-faint">{fields.length}</span>
      </button>
      {open ? (
        <div>
          {fields.map((field) => (
            <FieldRow key={field.name} field={field} kind={kind} onInsert={onInsert} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Postman-style schema browser. Introspects the endpoint and lists every Query and Mutation
 * field with its return type and (recursively expandable) arguments. Clicking a field — or its
 * + button — scaffolds a starter operation + variables into the editor.
 */
export function SchemaTree({
  endpoint,
  token,
  headers,
  enabled,
  search,
  onInsert,
}: {
  endpoint: string;
  token?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  search: string;
  onInsert: (query: string, variables: string) => void;
}): React.JSX.Element {
  const { schema, loading, error, reload } = useGraphqlSchema({ endpoint, token, headers }, enabled);

  const operations = useMemo(() => (schema ? listOperations(schema) : null), [schema]);
  const filtered = useMemo(() => {
    if (!operations) return null;
    const term = search.trim().toLowerCase();
    if (!term) return operations;
    const match = (f: SchemaField): boolean =>
      f.name.toLowerCase().includes(term) || f.typeString.toLowerCase().includes(term);
    return {
      queries: operations.queries.filter(match),
      mutations: operations.mutations.filter(match),
    };
  }, [operations, search]);

  const handleInsert = useCallback(
    (kind: OperationKind, name: string) => {
      if (!schema) return;
      const { query, variables } = buildOperation(schema, kind, name);
      if (query) onInsert(query, variables);
    },
    [schema, onInsert],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[12px] text-faint">
        <Loader2 size={20} className="animate-spin" />
        Loading schema…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center text-[12px] text-faint">
        <AlertTriangle size={20} className="text-amber-400" />
        <span>{error}</span>
        <button
          type="button"
          onClick={reload}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-fg hover:border-line-strong"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }
  if (!filtered) return <div className="px-4 py-10 text-center text-[12px] text-faint">Schema unavailable.</div>;

  const empty = filtered.queries.length === 0 && filtered.mutations.length === 0;

  return (
    <div className="p-1">
      <div className="flex items-center justify-between px-1.5 pb-1">
        <span className="text-[10.5px] text-faint">Click a field to scaffold it</span>
        <button type="button" onClick={reload} title="Reload schema" className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg">
          <RefreshCw size={12} />
        </button>
      </div>
      {empty ? (
        <div className="px-4 py-8 text-center text-[12px] text-faint">No fields match.</div>
      ) : (
        <>
          <Group label="Query" fields={filtered.queries} kind="query" onInsert={handleInsert} />
          <Group label="Mutation" fields={filtered.mutations} kind="mutation" onInsert={handleInsert} />
        </>
      )}
    </div>
  );
}
