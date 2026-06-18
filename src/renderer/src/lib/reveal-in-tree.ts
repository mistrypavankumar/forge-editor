import { useWorkspaceStore } from '../stores/workspace-store';

/**
 * Expand every ancestor folder of `filePath` in the Structure tree (lazily loading each folder's
 * children as needed) so the file's row becomes visible. No-op when the file isn't under the
 * current tree root (the workspace root, or the scoped subfolder). The active row scrolls itself
 * into view once it renders (see TreeNode).
 */
export async function revealInTree(filePath: string): Promise<void> {
  const { scopedPath, rootPath } = useWorkspaceStore.getState();
  const root = scopedPath ?? rootPath;
  if (!root || (filePath !== root && !filePath.startsWith(`${root}/`))) return;

  const rel = filePath.slice(root.length).replace(/^\//, '');
  const parts = rel.split('/').filter(Boolean);

  // Walk root → file's parent, expanding and loading each directory along the way.
  let dir = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    dir = `${dir}/${parts[i]}`;
    const state = useWorkspaceStore.getState();
    if (!state.expandedPaths[dir]) state.expandPath(dir);
    if (state.childrenByPath[dir] === undefined) {
      const res = await window.forge.readDirectory(dir);
      if (res.ok) useWorkspaceStore.getState().setChildren(dir, res.data);
    }
  }
}
