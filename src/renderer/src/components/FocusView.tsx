import { useEffect, useState } from 'react';
import { Target, GitBranch } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFilePath } from '../lib/workspace-actions';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow } from './ProjectRow';
import { cn } from '../lib/cn';
import type { GitChange } from '@shared/ipc-contract';

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i).replace(/^\//, '') : '';
}

const STATUS_STYLE: Record<GitChange['status'], { letter: string; cls: string }> = {
  M: { letter: 'M', cls: 'text-warning' },
  A: { letter: 'A', cls: 'text-success' },
  D: { letter: 'D', cls: 'text-danger' },
  R: { letter: 'R', cls: 'text-info' },
  U: { letter: 'U', cls: 'text-success' },
};

export function FocusView(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const active = tabs.find((t) => t.path === activePath);
  const others = tabs.filter((t) => t.path !== activePath);

  const [changes, setChanges] = useState<GitChange[]>([]);
  useEffect(() => {
    if (!rootPath) {
      setChanges([]);
      return;
    }
    void window.forge.gitChangedFiles(rootPath).then((res) => {
      if (res.ok) setChanges(res.data);
    });
  }, [rootPath, tabs]);

  return (
    <div className="flex h-full flex-col">
      {/* Working set */}
      <div className="min-h-0 flex-1 overflow-auto pb-3">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm text-faint">Open a file to focus your working set.</p>
          </div>
        ) : (
          <>
            <div className="mx-2 mb-2 mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2">
              <Target size={14} className="text-accent" />
              <span className="text-[11px] text-faint">Focus</span>
              <span className="ml-1 truncate text-[13px] font-medium text-fg">
                {active?.name ?? 'Working set'}
              </span>
            </div>
            {active ? (
              <ProjectRow
                icon={<ModernFileIcon name={active.name} />}
                name={active.name}
                meta={dirOf(active.path)}
                badge={active.dirty ? { label: 'modified', tone: 'changed' } : undefined}
                onClick={() => setActive(active.path)}
              />
            ) : null}
            {others.length > 0 ? (
              <>
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Also open
                </div>
                {others.map((t) => (
                  <ProjectRow
                    key={t.path}
                    icon={<ModernFileIcon name={t.name} />}
                    name={t.name}
                    meta={dirOf(t.path)}
                    badge={t.dirty ? { label: 'modified', tone: 'changed' } : undefined}
                    onClick={() => setActive(t.path)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Git changes (bottom half) */}
      <div className="flex max-h-[45%] shrink-0 flex-col border-t border-line">
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
              return (
                <ProjectRow
                  key={c.path}
                  icon={<ModernFileIcon name={c.name} />}
                  name={c.name}
                  meta={dirOf(c.path)}
                  trailing={<span className={cn('font-mono text-[11px]', s.cls)}>{s.letter}</span>}
                  onClick={() => rootPath && void openFilePath(`${rootPath}/${c.path}`, c.name)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
