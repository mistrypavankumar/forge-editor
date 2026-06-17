import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { FileTypeIcon, FolderIcon } from './file-icon';
import type { DirEntry } from '@shared/ipc-contract';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedPaths[entry.path] ?? false);
  const children = useWorkspaceStore((s) => s.childrenByPath[entry.path]);
  const setChildren = useWorkspaceStore((s) => s.setChildren);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const openFile = useEditorStore((s) => s.openFile);
  const activePath = useEditorStore((s) => s.activePath);

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

  return (
    <>
      <div
        className={`tree-node${isActive ? ' tree-node-active' : ''}`}
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => void onClick()}
      >
        <span className="tree-twisty">
          {entry.isDirectory ? (
            expanded ? (
              <ChevronDown size={14} strokeWidth={2} />
            ) : (
              <ChevronRight size={14} strokeWidth={2} />
            )
          ) : null}
        </span>
        <span className="tree-icon">
          {entry.isDirectory ? <FolderIcon open={expanded} /> : <FileTypeIcon name={entry.name} />}
        </span>
        <span className="tree-label">{entry.name}</span>
      </div>
      {entry.isDirectory && expanded
        ? (children ?? []).map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

export function FileExplorer(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const onOpenFolder = async (): Promise<void> => {
    const res = await window.forge.openFolder();
    if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
  };

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="explorer-title" title={rootPath ?? undefined}>
          {rootPath ? basename(rootPath) : 'Explorer'}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => void onOpenFolder()}
          aria-label="Change folder"
          title="Change folder"
        >
          <FolderOpen size={15} strokeWidth={1.75} />
        </button>
      </div>
      {rootPath ? (
        <div className="explorer-tree">
          {rootEntries.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0} />
          ))}
        </div>
      ) : (
        <div className="explorer-empty">
          <p>No folder opened</p>
          <button type="button" className="primary-button" onClick={() => void onOpenFolder()}>
            Open Folder
          </button>
        </div>
      )}
    </div>
  );
}
