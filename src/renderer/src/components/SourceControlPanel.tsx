import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, GitCommitVertical, Plus, Minus, Undo2 } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFilePath } from '../lib/workspace-actions';
import { deleteEntry } from '../lib/fs-actions';
import { PanelHeader } from './ui/Panel';
import { ModernFileIcon } from './ModernFileIcon';
import { cn } from '../lib/cn';
import type { GitChange } from '@shared/ipc-contract';

const STATUS_CLS: Record<GitChange['status'], string> = {
  M: 'text-warning',
  A: 'text-success',
  D: 'text-danger',
  R: 'text-info',
  U: 'text-success',
};

function ChangeRow({
  change,
  rootPath,
  actions,
}: {
  change: GitChange;
  rootPath: string;
  actions: { icon: typeof Plus; label: string; onClick: () => void }[];
}): React.JSX.Element {
  return (
    <div
      onClick={() => void openFilePath(`${rootPath}/${change.path}`, change.name)}
      className="group flex h-7 cursor-pointer items-center gap-2 px-3 hover:bg-surface-2"
    >
      <ModernFileIcon name={change.name} />
      <span className="truncate text-[13px] text-muted">{change.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              aria-label={a.label}
              title={a.label}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
            >
              <a.icon size={13} />
            </button>
          ))}
        </span>
        <span className={cn('w-3 text-center font-mono text-[11px]', STATUS_CLS[change.status])}>
          {change.status}
        </span>
      </span>
    </div>
  );
}

function GroupHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count: number;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="group flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {title}
      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {actions}
      </span>
      <span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[10px] normal-case text-muted">
        {count}
      </span>
    </div>
  );
}

export function SourceControlPanel(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const branch = useWorkspaceStore((s) => s.branch);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const refresh = useCallback(() => {
    if (!rootPath) return;
    void window.forge.gitChangedFiles(rootPath).then((res) => {
      if (res.ok) setChanges(res.data);
    });
  }, [rootPath]);

  useEffect(() => refresh(), [refresh]);

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Source Control" />
        <p className="px-3 py-2 text-[12px] text-faint">Open a folder to use source control.</p>
      </div>
    );
  }
  const root = rootPath;

  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => c.unstaged);

  const stage = (c: GitChange): void => {
    void window.forge.gitStage(root, c.path).then(refresh);
  };
  const unstage = (c: GitChange): void => {
    void window.forge.gitUnstage(root, c.path).then(refresh);
  };
  const discard = (c: GitChange): void => {
    if (!window.confirm(`Discard changes in "${c.name}"? This cannot be undone.`)) return;
    const op = c.status === 'U' ? deleteEntry(`${root}/${c.path}`) : window.forge.gitDiscard(root, c.path);
    void Promise.resolve(op).then(refresh);
  };

  const commit = async (): Promise<void> => {
    if (!message.trim() || changes.length === 0) return;
    setCommitting(true);
    const res = await window.forge.gitCommit(root, message.trim());
    setCommitting(false);
    if (res.ok) {
      setMessage('');
      refresh();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Source Control"
        actions={
          <button
            type="button"
            aria-label="Refresh"
            onClick={refresh}
            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
          >
            <RefreshCw size={13} />
          </button>
        }
      />
      <div className="flex flex-col gap-2 px-2 pb-2">
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Message (commit on ${branch ?? 'branch'})`}
          className="resize-none rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={committing || !message.trim() || changes.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:bg-accent-hover disabled:opacity-40"
        >
          <GitCommitVertical size={14} />
          Commit
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {changes.length === 0 ? <p className="px-3 py-2 text-[12px] text-faint">No changes</p> : null}

        {staged.length > 0 ? (
          <>
            <GroupHeader title="Staged Changes" count={staged.length} />
            {staged.map((c) => (
              <ChangeRow
                key={`s-${c.path}`}
                change={c}
                rootPath={root}
                actions={[{ icon: Minus, label: 'Unstage', onClick: () => unstage(c) }]}
              />
            ))}
          </>
        ) : null}

        {unstaged.length > 0 ? (
          <>
            <GroupHeader
              title="Changes"
              count={unstaged.length}
              actions={
                <button
                  type="button"
                  aria-label="Stage all changes"
                  title="Stage all changes"
                  onClick={() => void window.forge.gitStageAll(root).then(refresh)}
                  className="flex h-4 w-4 items-center justify-center rounded text-faint hover:text-fg"
                >
                  <Plus size={13} />
                </button>
              }
            />
            {unstaged.map((c) => (
              <ChangeRow
                key={`u-${c.path}`}
                change={c}
                rootPath={root}
                actions={[
                  { icon: Undo2, label: 'Discard changes', onClick: () => discard(c) },
                  { icon: Plus, label: 'Stage changes', onClick: () => stage(c) },
                ]}
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
