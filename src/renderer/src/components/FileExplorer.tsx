import { useState } from 'react';
import { FolderOpen, ChevronLeft } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useFileClipboard } from '../stores/file-clipboard';
import { openFolderDialog } from '../lib/workspace-actions';
import { deleteEntry, pasteInto } from '../lib/fs-actions';
import { FileTree } from './FileTree';
import { IconButton } from './ui/IconButton';
import { ContextMenu, type MenuItem } from './ui/ContextMenu';
import type { DirEntry } from '@shared/ipc-contract';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function relativeTo(path: string, root: string | null): string {
  if (root && (path === root || path.startsWith(`${root}/`))) {
    return path.slice(root.length).replace(/^\//, '');
  }
  return path;
}

/** Real file-system tree (backs the Structure tab). Can be scoped to a subfolder. */
export function FileExplorer(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const childrenByPath = useWorkspaceStore((s) => s.childrenByPath);
  const scopedPath = useWorkspaceStore((s) => s.scopedPath);
  const setScope = useWorkspaceStore((s) => s.setScope);
  const setRenaming = useWorkspaceStore((s) => s.setRenaming);
  const setClipboard = useFileClipboard((s) => s.set);
  const clipboardItem = useFileClipboard((s) => s.item);

  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry } | null>(null);

  const onOpenFolder = (): void => void openFolderDialog();

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-faint">No folder opened</p>
        <button
          type="button"
          onClick={() => void onOpenFolder()}
          className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          Open Folder
        </button>
      </div>
    );
  }

  const scoped = scopedPath !== null;
  const entries = scoped ? (childrenByPath[scopedPath] ?? []) : rootEntries;

  const copy = (text: string): void => void navigator.clipboard?.writeText(text);

  const menuItems = (entry: DirEntry): MenuItem[] => {
    const items: MenuItem[] = [
      { label: 'Cut', onSelect: () => setClipboard({ path: entry.path, name: entry.name }, 'cut') },
      {
        label: 'Copy',
        dividerAfter: !entry.isDirectory || !clipboardItem,
        onSelect: () => setClipboard({ path: entry.path, name: entry.name }, 'copy'),
      },
    ];
    if (entry.isDirectory && clipboardItem) {
      items.push({ label: 'Paste', dividerAfter: true, onSelect: () => void pasteInto(entry.path) });
    }
    items.push(
      { label: 'Copy Path', onSelect: () => copy(entry.path) },
      {
        label: 'Copy Relative Path',
        dividerAfter: true,
        onSelect: () => copy(relativeTo(entry.path, rootPath)),
      },
      { label: 'Rename…', onSelect: () => setRenaming(entry.path) },
      {
        label: 'Delete',
        onSelect: () => {
          if (window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) {
            void deleteEntry(entry.path);
          }
        },
      },
    );
    return items;
  };

  return (
    <div className="flex h-full flex-col">
      {scoped ? (
        <button
          type="button"
          onClick={() => setScope(null)}
          className="flex h-8 shrink-0 items-center gap-1 px-2 text-[11px] text-faint hover:text-fg"
        >
          <ChevronLeft size={13} />
          <span className="font-semibold uppercase tracking-wider text-muted">
            {basename(scopedPath)}
          </span>
          <span className="ml-auto pr-1 text-faint">Show all</span>
        </button>
      ) : (
        <div className="flex h-8 shrink-0 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <span className="truncate">{basename(rootPath)}</span>
          <IconButton label="Change folder" className="h-6 w-6" onClick={() => void onOpenFolder()}>
            <FolderOpen size={13} />
          </IconButton>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        <FileTree
          entries={entries}
          onContextMenu={(e, entry) => setMenu({ x: e.clientX, y: e.clientY, entry })}
        />
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menuItems(menu.entry)}
        />
      ) : null}
    </div>
  );
}
