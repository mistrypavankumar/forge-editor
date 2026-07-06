import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useRecentsStore } from '../stores/recents-store';
import { isImagePath } from './is-image';
import type { DirEntry, GitChange } from '@shared/ipc-contract';

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
  const fileName = name ?? base(path);
  // Images render from raw bytes in the image viewer — skip the text read.
  if (isImagePath(fileName)) {
    applyFile(path, fileName, '', record);
    return;
  }
  const res = await window.forge.readFile(path);
  if (res.ok) applyFile(path, fileName, res.data, record);
}

/** Synthetic path backing the single API Explorer tab. */
export const API_EXPLORER_PATH = 'api-explorer://request';

/** Open (or focus) the API Explorer as an editor tab. */
export function openApiExplorer(): void {
  useEditorStore.getState().openFile({
    path: API_EXPLORER_PATH,
    name: 'API Explorer',
    content: '',
    kind: 'api-explorer',
  });
}

/** Synthetic path backing the single Codebase Map tab. */
export const CODEMAP_PATH = 'codemap://graph';

/** Open (or focus) the Codebase Map (dependency graph) as an editor tab. */
export function openCodebaseMap(): void {
  useEditorStore.getState().openFile({
    path: CODEMAP_PATH,
    name: 'Codebase Map',
    content: '',
    kind: 'codemap',
  });
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

/** Open a read-only diff of a file as changed by a single commit (commit vs its parent). */
export async function openGitCommitDiff(
  rootPath: string,
  hash: string,
  relPath: string,
  status: GitChange['status'],
): Promise<void> {
  const filePath = `${rootPath}/${relPath}`;
  const [parentRes, commitRes] = await Promise.all([
    status === 'A' ? Promise.resolve(null) : window.forge.gitFileAt(rootPath, `${hash}^`, relPath),
    status === 'D' ? Promise.resolve(null) : window.forge.gitFileAt(rootPath, hash, relPath),
  ]);
  const original = parentRes && parentRes.ok && parentRes.data != null ? parentRes.data : '';
  const content = commitRes && commitRes.ok && commitRes.data != null ? commitRes.data : '';
  useEditorStore.getState().openFile({
    path: `git-commit://${hash}/${filePath}`,
    name: `${base(relPath)} @ ${hash}`,
    content,
    original,
    readOnly: true,
    filePath,
  });
}
