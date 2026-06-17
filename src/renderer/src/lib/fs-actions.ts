import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useFileClipboard } from '../stores/file-clipboard';

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '/';
}

/** Re-read a directory and update the tree (root entries or a child list). */
export async function refreshDir(dir: string): Promise<void> {
  const ws = useWorkspaceStore.getState();
  const res = await window.forge.readDirectory(dir);
  if (!res.ok) return;
  if (dir === ws.rootPath) ws.setRootEntries(res.data);
  else ws.setChildren(dir, res.data);
}

export async function renameEntry(oldPath: string, newName: string): Promise<void> {
  const dir = dirname(oldPath);
  const trimmed = newName.trim();
  useWorkspaceStore.getState().setRenaming(null);
  if (!trimmed || trimmed === oldPath.slice(dir.length + 1)) return;
  const newPath = `${dir}/${trimmed}`;
  const res = await window.forge.rename(oldPath, newPath);
  if (res.ok) await refreshDir(dir);
}

export async function deleteEntry(path: string): Promise<void> {
  const res = await window.forge.remove(path);
  if (res.ok) {
    await refreshDir(dirname(path));
    useEditorStore.getState().closeFile(path);
  }
}

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function namesIn(dir: string): string[] {
  const ws = useWorkspaceStore.getState();
  const entries = dir === ws.rootPath ? ws.rootEntries : (ws.childrenByPath[dir] ?? []);
  return entries.map((e) => e.name);
}

export async function newFile(dir: string): Promise<void> {
  const name = uniqueName('untitled', namesIn(dir));
  const path = `${dir}/${name}`;
  const res = await window.forge.writeFile(path, '');
  if (res.ok) {
    await refreshDir(dir);
    useWorkspaceStore.getState().setRenaming(path);
  }
}

export async function newFolder(dir: string): Promise<void> {
  const name = uniqueName('new-folder', namesIn(dir));
  const path = `${dir}/${name}`;
  const res = await window.forge.mkdir(path);
  if (res.ok) {
    await refreshDir(dir);
    useWorkspaceStore.getState().setRenaming(path);
  }
}

export async function pasteInto(destDir: string): Promise<void> {
  const cb = useFileClipboard.getState();
  if (!cb.item || !cb.mode) return;
  const op = cb.mode === 'cut' ? window.forge.moveEntry : window.forge.copyEntry;
  const res = await op(cb.item.path, destDir);
  if (res.ok) {
    await refreshDir(destDir);
    if (cb.mode === 'cut') await refreshDir(dirname(cb.item.path));
    cb.clear();
  }
}
