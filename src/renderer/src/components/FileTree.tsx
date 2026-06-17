import { ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { renameEntry } from '../lib/fs-actions';
import { FileTypeIcon, FolderIcon } from './file-icon';
import { cn } from '../lib/cn';
import type { DirEntry } from '@shared/ipc-contract';

type NodeContextHandler = (e: React.MouseEvent, entry: DirEntry) => void;

function TreeNode({
  entry,
  depth,
  onNodeContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  onNodeContextMenu: NodeContextHandler;
}): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedPaths[entry.path] ?? false);
  const children = useWorkspaceStore((s) => s.childrenByPath[entry.path]);
  const renaming = useWorkspaceStore((s) => s.renamingPath === entry.path);
  const setChildren = useWorkspaceStore((s) => s.setChildren);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const setRenaming = useWorkspaceStore((s) => s.setRenaming);
  const openFile = useEditorStore((s) => s.openFile);
  const activePath = useEditorStore((s) => s.activePath);
  const dirty = useEditorStore((s) => s.tabs.some((t) => t.path === entry.path && t.dirty));

  const onClick = async (): Promise<void> => {
    if (entry.isDirectory) {
      toggleExpanded(entry.path);
      if (!expanded && children === undefined) {
        const res = await window.forge.readDirectory(entry.path);
        if (res.ok) setChildren(entry.path, res.data);
      }
      return;
    }
    const res = await window.forge.readFile(entry.path);
    if (res.ok) openFile({ path: entry.path, name: entry.name, content: res.data });
  };

  const isActive = !entry.isDirectory && entry.path === activePath;
  const indent = depth * 12 + 6;
  const icon = entry.isDirectory ? (
    <FolderIcon open={expanded} name={entry.name} />
  ) : (
    <FileTypeIcon name={entry.name} />
  );

  return (
    <>
      {renaming ? (
        <div className="flex h-[22px] items-center gap-1.5 pr-2" style={{ paddingLeft: indent }}>
          <span className="w-3.5 shrink-0" />
          <span className="flex shrink-0 items-center">{icon}</span>
          <input
            autoFocus
            defaultValue={entry.name}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void renameEntry(entry.path, e.currentTarget.value);
              else if (e.key === 'Escape') setRenaming(null);
            }}
            onBlur={() => setRenaming(null)}
            className="w-full rounded border border-accent/60 bg-surface-2 px-1 text-[13px] text-fg outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void onClick()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNodeContextMenu(e, entry);
          }}
          style={{ paddingLeft: indent }}
          className={cn(
            'group flex h-[22px] w-full items-center gap-1.5 pr-2 text-[13px] transition-colors',
            isActive ? 'bg-accent/12 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          <span className="flex w-3.5 shrink-0 justify-center text-faint">
            {entry.isDirectory ? (
              <ChevronRight
                size={13}
                strokeWidth={2}
                className={cn('transition-transform', expanded && 'rotate-90')}
              />
            ) : null}
          </span>
          <span className="flex shrink-0 items-center">{icon}</span>
          <span className="flex-1 truncate text-left">{entry.name}</span>
          {dirty ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
          ) : null}
        </button>
      )}
      {entry.isDirectory && expanded ? (
        <FileTree entries={children ?? []} depth={depth + 1} onContextMenu={onNodeContextMenu} />
      ) : null}
    </>
  );
}

interface FileTreeProps {
  entries: DirEntry[];
  depth?: number;
  onContextMenu: NodeContextHandler;
}

export function FileTree({ entries, depth = 0, onContextMenu }: FileTreeProps): React.JSX.Element {
  return (
    <>
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={depth} onNodeContextMenu={onContextMenu} />
      ))}
    </>
  );
}
