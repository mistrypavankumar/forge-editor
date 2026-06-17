import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, GitCommitVertical } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFilePath } from '../lib/workspace-actions';
import { PanelHeader } from './ui/Panel';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow } from './ProjectRow';
import { IconButton } from './ui/IconButton';
import { cn } from '../lib/cn';
import type { GitChange } from '@shared/ipc-contract';

const STATUS_STYLE: Record<GitChange['status'], { letter: string; cls: string }> = {
  M: { letter: 'M', cls: 'text-warning' },
  A: { letter: 'A', cls: 'text-success' },
  D: { letter: 'D', cls: 'text-danger' },
  R: { letter: 'R', cls: 'text-info' },
  U: { letter: 'U', cls: 'text-success' },
};

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

  const commit = async (): Promise<void> => {
    if (!rootPath || !message.trim() || changes.length === 0) return;
    setCommitting(true);
    const res = await window.forge.gitCommit(rootPath, message.trim());
    setCommitting(false);
    if (res.ok) {
      setMessage('');
      refresh();
      void window.forge.gitBranch(rootPath).then((r) => {
        useWorkspaceStore.getState().setBranch(r.ok ? r.data : null);
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Source Control"
        actions={
          <IconButton label="Refresh" className="h-6 w-6" onClick={refresh}>
            <RefreshCw size={13} />
          </IconButton>
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
          Commit {changes.length > 0 ? `${changes.length} file${changes.length === 1 ? '' : 's'}` : ''}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {changes.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-faint">No changes</p>
        ) : (
          changes.map((c) => {
            const s = STATUS_STYLE[c.status];
            return (
              <ProjectRow
                key={c.path}
                icon={<ModernFileIcon name={c.name} />}
                name={c.name}
                meta={c.path}
                trailing={<span className={cn('font-mono text-[11px]', s.cls)}>{s.letter}</span>}
                onClick={() => rootPath && void openFilePath(`${rootPath}/${c.path}`, c.name)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
