import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import type { DirEntry } from '@shared/ipc-contract';

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }): React.JSX.Element {
  const expanded = useWorkspaceStore((s) => s.expandedPaths[entry.path] ?? false);
  const children = useWorkspaceStore((s) => s.childrenByPath[entry.path]);
  const setChildren = useWorkspaceStore((s) => s.setChildren);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const openFile = useEditorStore((s) => s.openFile);

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

  return (
    <>
      <div
        className="tree-node"
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => void onClick()}
      >
        {entry.isDirectory ? (expanded ? '▾ ' : '▸ ') : '  '}
        {entry.name}
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
        <span className="explorer-title">{rootPath ?? 'No folder'}</span>
        <button type="button" onClick={() => void onOpenFolder()}>
          Open Folder
        </button>
      </div>
      <div className="explorer-tree">
        {rootEntries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} />
        ))}
      </div>
    </div>
  );
}
