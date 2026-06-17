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

function applyFile(path: string, name: string, content: string): void {
  useEditorStore.getState().openFile({ path, name, content });
  useRecentsStore.getState().addRecent({ type: 'file', path, name });
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
  if (res.ok && res.data) applyFile(res.data.path, res.data.name, res.data.content);
}

export async function openFilePath(path: string, name?: string): Promise<void> {
  const res = await window.forge.readFile(path);
  if (res.ok) applyFile(path, name ?? base(path), res.data);
}
