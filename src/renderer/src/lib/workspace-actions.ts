import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useRecentsStore } from '../stores/recents-store';
import type { DirEntry } from '@shared/ipc-contract';

function base(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function applyFolder(rootPath: string, tree: DirEntry[]): void {
  useWorkspaceStore.getState().setWorkspace(rootPath, tree);
  useRecentsStore.getState().addRecent({ type: 'folder', path: rootPath, name: base(rootPath) });
}

function applyFile(path: string, name: string, content: string, record: boolean): void {
  useEditorStore.getState().openFile({ path, name, content });
  // Only explicit "Open File"/recents reopens count as recents — not editor navigation.
  if (record) useRecentsStore.getState().addRecent({ type: 'file', path, name });
}

export async function openFolderDialog(): Promise<void> {
  const res = await window.forge.openFolder();
  if (res.ok && res.data) applyFolder(res.data.rootPath, res.data.tree);
}

export async function openFolderPath(path: string): Promise<void> {
  const res = await window.forge.readDirectory(path);
  if (res.ok) applyFolder(path, res.data);
}

export async function openFileDialog(): Promise<void> {
  const res = await window.forge.openFileDialog();
  if (res.ok && res.data) applyFile(res.data.path, res.data.name, res.data.content, true);
}

/** Open a file by path. `record` adds it to Recent (only for landing/recents flows). */
export async function openFilePath(path: string, name?: string, record = false): Promise<void> {
  const res = await window.forge.readFile(path);
  if (res.ok) applyFile(path, name ?? base(path), res.data, record);
}

/** Open a read-only side-by-side diff of the staged (index) version against HEAD. */
export async function openGitStagedDiff(rootPath: string, relPath: string): Promise<void> {
  const filePath = `${rootPath}/${relPath}`;
  const [origRes, stagedRes] = await Promise.all([
    window.forge.gitOriginal(rootPath, filePath),
    window.forge.gitStaged(rootPath, filePath),
  ]);
  const original = origRes.ok && origRes.data != null ? origRes.data : '';
  const content = stagedRes.ok && stagedRes.data != null ? stagedRes.data : '';
  useEditorStore.getState().openFile({
    path: `git-index://${filePath}`,
    name: base(relPath),
    content,
    original,
    readOnly: true,
    filePath,
  });
}
