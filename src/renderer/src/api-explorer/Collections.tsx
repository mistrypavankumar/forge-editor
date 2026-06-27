import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import type { Collection, SavedRequest } from './types';

import { cn } from '../lib/cn';
import { useApiExplorerStore } from './store';

/** Inline name editor shared by collections and requests. */
function NameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
        else if (e.key === 'Escape') onCancel();
      }}
      className="min-w-0 flex-1 rounded border border-accent/70 bg-surface px-1 py-0.5 text-[12px] text-fg outline-none"
    />
  );
}

function RequestRow({
  request,
  active,
  editing,
  onStartEdit,
  onStopEdit,
}: {
  request: SavedRequest;
  active: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}): React.JSX.Element {
  const loadSavedRequest = useApiExplorerStore((s) => s.loadSavedRequest);
  const renameRequest = useApiExplorerStore((s) => s.renameRequest);
  const duplicateRequest = useApiExplorerStore((s) => s.duplicateRequest);
  const removeRequest = useApiExplorerStore((s) => s.removeRequest);

  return (
    <div
      onClick={() => loadSavedRequest(request.id)}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pl-5 pr-1.5 transition-colors',
        active ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded px-1 py-0.5 text-[8.5px] font-bold uppercase',
          active ? 'bg-accent/25 text-accent' : 'bg-surface-3 text-accent',
        )}
      >
        {request.bodyMode === 'graphql' ? 'GQL' : request.method}
      </span>
      {editing ? (
        <NameInput
          value={request.name}
          onCommit={(next) => {
            renameRequest(request.id, next);
            onStopEdit();
          }}
          onCancel={onStopEdit}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px]">{request.name}</span>
      )}
      {!editing ? (
        <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
          <button
            type="button"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              duplicateRequest(request.id);
            }}
            className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <Copy size={11} />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              removeRequest(request.id);
            }}
            className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CollectionGroup({
  collection,
  search,
  activeRequestId,
  editingId,
  setEditingId,
}: {
  collection: Collection;
  search: string;
  activeRequestId: string | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}): React.JSX.Element {
  const toggleCollection = useApiExplorerStore((s) => s.toggleCollection);
  const renameCollection = useApiExplorerStore((s) => s.renameCollection);
  const removeCollection = useApiExplorerStore((s) => s.removeCollection);

  const term = search.trim().toLowerCase();
  const requests = term
    ? collection.requests.filter(
        (r) => r.name.toLowerCase().includes(term) || r.url.toLowerCase().includes(term),
      )
    : collection.requests;

  // While searching, hide collections with no matches and force-expand the rest.
  if (term && requests.length === 0) return <></>;
  const expanded = term ? true : !collection.collapsed;

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-surface-2">
        <button
          type="button"
          onClick={() => toggleCollection(collection.id)}
          className="shrink-0 rounded p-0.5 text-faint hover:text-fg"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {editingId === collection.id ? (
          <NameInput
            value={collection.name}
            onCommit={(next) => {
              renameCollection(collection.id, next);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => toggleCollection(collection.id)}
            className="min-w-0 flex-1 truncate text-left text-[12px] font-bold uppercase tracking-wide text-fg"
          >
            {collection.name}
          </button>
        )}
        <span className="shrink-0 text-[10px] text-faint">{collection.requests.length}</span>
        {editingId !== collection.id ? (
          <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
            <button
              type="button"
              title="Rename collection"
              onClick={() => setEditingId(collection.id)}
              className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              title="Delete collection"
              onClick={() => removeCollection(collection.id)}
              className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex flex-col">
          {requests.length === 0 ? (
            <div className="py-1 pl-6 text-[11px] text-faint">
              No requests yet — use Save in the toolbar.
            </div>
          ) : (
            requests.map((r) => (
              <RequestRow
                key={r.id}
                request={r}
                active={r.id === activeRequestId}
                editing={editingId === r.id}
                onStartEdit={() => setEditingId(r.id)}
                onStopEdit={() => setEditingId(null)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Collections({ search }: { search: string }): React.JSX.Element {
  const collections = useApiExplorerStore((s) => s.collections);
  const activeRequestId = useApiExplorerStore((s) => s.activeRequestId);
  const createCollection = useApiExplorerStore((s) => s.createCollection);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasAny = collections.length > 0;
  const noMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return false;
    return !collections.some((c) =>
      c.requests.some(
        (r) => r.name.toLowerCase().includes(term) || r.url.toLowerCase().includes(term),
      ),
    );
  }, [collections, search]);

  return (
    <div className="flex flex-col p-1.5">
      <button
        type="button"
        onClick={() => setEditingId(createCollection('New Collection'))}
        className="mb-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
      >
        <FolderPlus size={13} /> New collection
      </button>

      {!hasAny ? (
        <div className="px-2 py-8 text-center text-[12px] text-faint">
          <Plus size={18} className="mx-auto mb-2 opacity-60" />
          No collections yet. Create one, then Save requests into it from the toolbar.
        </div>
      ) : noMatches ? (
        <div className="px-4 py-8 text-center text-[12px] text-faint">No requests match.</div>
      ) : (
        collections.map((c) => (
          <CollectionGroup
            key={c.id}
            collection={c}
            search={search}
            activeRequestId={activeRequestId}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        ))
      )}
    </div>
  );
}
