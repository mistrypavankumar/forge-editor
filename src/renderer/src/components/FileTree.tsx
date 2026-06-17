import { ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { problems } from '../data/problems';
import { FileTypeIcon, FolderIcon } from './file-icon';
import { cn } from '../lib/cn';
import type { DirEntry } from '@shared/ipc-contract';

function hasError(path: string, isDir: boolean): boolean {
  return problems.some(
    (p) => p.severity === 'error' && (isDir ? p.file.startsWith(`${path}/`) : p.file === path),
  );
}

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedPaths[entry.path] ?? false);
  const children = useWorkspaceStore((s) => s.childrenByPath[entry.path]);
  const setChildren = useWorkspaceStore((s) => s.setChildren);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
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
  const errored = hasError(entry.path, entry.isDirectory);

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        style={{ paddingLeft: depth * 12 + 8 }}
        className={cn(
          'group flex h-[26px] w-full items-center gap-1.5 pr-2 text-[13px] transition-colors',
          isActive ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-3 hover:text-fg',
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
        <span className="flex shrink-0 items-center">
          {entry.isDirectory ? <FolderIcon open={expanded} /> : <FileTypeIcon name={entry.name} />}
        </span>
        <span className={cn('flex-1 truncate text-left', errored && 'text-danger')}>
          {entry.name}
        </span>
        {dirty ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
        ) : errored ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" title="Has errors" />
        ) : null}
      </button>
      {entry.isDirectory && expanded ? (
        <FileTree entries={children ?? []} depth={depth + 1} />
      ) : null}
    </>
  );
}

interface FileTreeProps {
  entries: DirEntry[];
  depth?: number;
}

export function FileTree({ entries, depth = 0 }: FileTreeProps): React.JSX.Element {
  return (
    <>
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={depth} />
      ))}
    </>
  );
}
