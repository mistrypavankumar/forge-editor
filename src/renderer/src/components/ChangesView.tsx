import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { openFilePath } from '../lib/workspace-actions';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow } from './ProjectRow';
import { cn } from '../lib/cn';
import type { GitChange } from '@shared/ipc-contract';

/** Directory of `path`, relative to the workspace root when the file lives inside it. */
function relDir(path: string, rootPath: string | null): string {
  const rel = rootPath && path.startsWith(`${rootPath}/`) ? path.slice(rootPath.length + 1) : path;
  const i = rel.lastIndexOf('/');
  return (i > 0 ? rel.slice(0, i) : '').replace(/^\//, '');
}

const STATUS_STYLE: Record<GitChange['status'], { letter: string; cls: string }> = {
  M: { letter: 'M', cls: 'text-warning' },
  A: { letter: 'A', cls: 'text-success' },
  D: { letter: 'D', cls: 'text-danger' },
  R: { letter: 'R', cls: 'text-info' },
  U: { letter: 'U', cls: 'text-success' },
};

/** Working-tree git changes for the navigator. Click a row to open the file. */
export function ChangesView(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const syncTick = useWorkspaceStore((s) => s.syncTick);
  // Re-fetch when tabs change too, so saving a file refreshes its status.
  const tabs = useEditorStore((s) => s.tabs);

  const [changes, setChanges] = useState<GitChange[]>([]);
  useEffect(() => {
    if (!rootPath) {
      setChanges([]);
      return;
    }
    void window.forge.gitChangedFiles(rootPath).then((res) => {
      if (res.ok) setChanges(res.data);
    });
  }, [rootPath, tabs, syncTick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
        <GitBranch size={11} />
        Changes
        {changes.length > 0 ? (
          <span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[10px] normal-case text-muted">
            {changes.length}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {changes.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-faint">No changes</p>
        ) : (
          changes.map((c) => {
            const s = STATUS_STYLE[c.status];
            const deleted = c.status === 'D';
            return (
              <ProjectRow
                key={c.path}
                icon={
                  <span className={cn('flex items-center', deleted && 'opacity-40 grayscale')}>
                    <ModernFileIcon name={c.name} />
                  </span>
                }
                name={c.name}
                nameClassName={deleted ? 'text-faint line-through' : undefined}
                meta={relDir(c.path, rootPath)}
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
