import { useState } from 'react';
import { X, Lock, SplitSquareHorizontal } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { FileTypeIcon } from './file-icon';
import { ContextMenu } from './ui/ContextMenu';
import { cn } from '../lib/cn';

function relativeTo(path: string, root: string | null): string {
  if (root && (path === root || path.startsWith(`${root}/`))) {
    return path.slice(root.length).replace(/^\//, '');
  }
  return path;
}

export function EditorTabs({ groupId = 'main' }: { groupId?: string }): React.JSX.Element | null {
  const tabs = useEditorStore((s) => s.tabs);
  const group = useEditorStore((s) => s.groups.find((g) => g.id === groupId));
  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);
  const closeOthers = useEditorStore((s) => s.closeOthers);
  const closeToRight = useEditorStore((s) => s.closeToRight);
  const closeSaved = useEditorStore((s) => s.closeSaved);
  const closeAll = useEditorStore((s) => s.closeAll);
  const splitRight = useEditorStore((s) => s.splitRight);
  const rootPath = useWorkspaceStore((s) => s.rootPath);

  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  if (!group || group.paths.length === 0) return null;

  const activePath = group.activePath;
  // Resolve the group's ordered paths to their shared document records.
  const groupTabs = group.paths.map((p) => tabs.find((t) => t.path === p)).filter((t) => t != null);

  const copy = (text: string): void => void navigator.clipboard?.writeText(text);

  return (
    <div className="flex h-9 shrink-0 items-stretch bg-surface">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {groupTabs.map((tab) => {
          const isActive = tab.path === activePath;
          return (
            <div
              key={tab.path}
              onClick={() => setActive(tab.path, groupId)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, path: tab.path });
              }}
              className={cn(
                'group relative flex max-w-[200px] cursor-pointer items-center gap-2 pl-3 pr-2 text-xs',
                isActive ? 'bg-bg text-fg' : 'text-faint hover:bg-surface-2 hover:text-muted',
              )}
            >
              {isActive ? <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" /> : null}
              <FileTypeIcon name={tab.name} />
              <span className="truncate">{tab.name}</span>
              {tab.readOnly ? <Lock size={11} className="shrink-0 text-faint" /> : null}
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(tab.path, groupId);
                }}
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg',
                  tab.dirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                {tab.dirty ? (
                  <span className="h-2 w-2 rounded-full bg-warning group-hover:hidden" />
                ) : null}
                <X size={13} className={cn(tab.dirty && 'hidden group-hover:block')} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Split editor right"
        title="Split editor right"
        onClick={() => activePath && splitRight(activePath)}
        className="flex w-8 shrink-0 items-center justify-center text-faint hover:bg-surface-2 hover:text-fg"
      >
        <SplitSquareHorizontal size={14} />
      </button>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Close', onSelect: () => closeFile(menu.path, groupId) },
            { label: 'Close Others', onSelect: () => closeOthers(menu.path, groupId) },
            { label: 'Close to the Right', onSelect: () => closeToRight(menu.path, groupId) },
            { label: 'Close Saved', onSelect: () => closeSaved(groupId) },
            { label: 'Close All', onSelect: () => closeAll(groupId) },
            { label: 'Split Right', dividerAfter: true, onSelect: () => splitRight(menu.path) },
            { label: 'Copy Path', onSelect: () => copy(menu.path) },
            {
              label: 'Copy Relative Path',
              onSelect: () => copy(relativeTo(menu.path, rootPath)),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
