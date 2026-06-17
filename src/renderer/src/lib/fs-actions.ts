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

/** Re-read the root and every already-loaded directory (for external sync). */
export async function refreshTree(): Promise<void> {
  const ws = useWorkspaceStore.getState();
  if (!ws.rootPath) return;
  await refreshDir(ws.rootPath);
  for (const dir of Object.keys(ws.childrenByPath)) {
    await refreshDir(dir);
  }
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

function namesIn(dir: string): string[] {
  const ws = useWorkspaceStore.getState();
  const entries = dir === ws.rootPath ? ws.rootEntries : (ws.childrenByPath[dir] ?? []);
  return entries.map((e) => e.name);
}

// Begin a draft (inline input) in `dir`; nothing is written until committed.
async function beginCreate(dir: string, kind: 'file' | 'folder'): Promise<void> {
  const ws = useWorkspaceStore.getState();
  if (dir !== ws.rootPath) {
    if (ws.childrenByPath[dir] === undefined) {
      const listing = await window.forge.readDirectory(dir);
      if (listing.ok) ws.setChildren(dir, listing.data);
    }
    ws.expandPath(dir);
  }
  ws.startCreating(dir, kind);
}

export function newFile(dir: string): Promise<void> {
  return beginCreate(dir, 'file');
}

export function newFolder(dir: string): Promise<void> {
  return beginCreate(dir, 'folder');
}

/** Commit the active draft with the typed name. Empty/duplicate name → discard. */
export async function commitCreate(name: string): Promise<void> {
  const ws = useWorkspaceStore.getState();
  const draft = ws.creating;
  if (!draft) return;
  ws.cancelCreating();
  const trimmed = name.trim();
  if (!trimmed || namesIn(draft.dir).includes(trimmed)) return;
  const path = `${draft.dir}/${trimmed}`;
  const res =
    draft.kind === 'file' ? await window.forge.writeFile(path, '') : await window.forge.mkdir(path);
  if (!res.ok) return;
  await refreshDir(draft.dir);
  if (draft.kind === 'file') {
    useEditorStore.getState().openFile({ path, name: trimmed, content: '' });
  } else {
    useWorkspaceStore.getState().expandPath(path);
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
