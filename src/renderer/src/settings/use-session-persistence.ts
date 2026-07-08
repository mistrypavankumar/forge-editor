import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { sessionRestoreSettled } from '../lib/workspace-actions';
import type { EditorSession } from '@shared/ipc-contract';

/** Cap on remembered workspaces, so the sessions map can't grow without bound. */
const MAX_SESSIONS = 40;
/** Coalesce bursts of tab activity (and let restore run first) before writing. */
const SAVE_DEBOUNCE_MS = 400;

/** A tab worth remembering: a real on-disk file inside the workspace, not a diff/synthetic view. */
function isPersistable(
  tab: { path: string; readOnly?: boolean; original?: string; kind?: string },
  folder: string,
): boolean {
  return (
    tab.path.startsWith(`${folder}/`) &&
    !tab.readOnly &&
    tab.original === undefined &&
    (tab.kind === undefined || tab.kind === 'file')
  );
}

/** Snapshot the current editor layout for `folder`, keeping only persistable files. Exported for tests. */
export function snapshot(folder: string): EditorSession {
  const { groups, tabs, activeGroupId } = useEditorStore.getState();
  const keep = new Set(tabs.filter((t) => isPersistable(t, folder)).map((t) => t.path));
  const sessionGroups = groups
    .map((g) => ({
      id: g.id,
      paths: g.paths.filter((p) => keep.has(p)),
      activePath: g.activePath && keep.has(g.activePath) ? g.activePath : null,
    }))
    .filter((g) => g.paths.length > 0);
  return { groups: sessionGroups, activeGroupId };
}

/** Exported for tests. */
export async function persist(folder: string): Promise<void> {
  const session = snapshot(folder);
  const res = await window.forge.loadSettings();
  // Read-modify-write the whole map: saveSettings merges shallowly, so writing just `{ sessions }`
  // would replace every other folder's entry. Re-read here so a second window's writes survive too.
  const next: Record<string, EditorSession> = { ...(res.ok ? res.data.sessions : undefined) };
  if (session.groups.length === 0) delete next[folder];
  else {
    delete next[folder]; // re-insert at the end so key order tracks recency for the cap below.
    next[folder] = session;
  }
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SESSIONS))) delete next[stale];
  await window.forge.saveSettings({ sessions: next });
}

/**
 * Persist the open editor tabs per workspace folder so a window reload (or reopening the folder
 * later) brings them back. Restore lives in workspace-actions `restoreSession`; this is the write
 * half. The signature deliberately excludes file *content*, so typing doesn't trigger a save — only
 * opening/closing/reordering/activating tabs or splitting does.
 */
export function useSessionPersistence(): void {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const groups = useEditorStore((s) => s.groups);
  const activeGroupId = useEditorStore((s) => s.activeGroupId);
  const tabs = useEditorStore((s) => s.tabs);

  const signature = useMemo(
    () =>
      JSON.stringify({
        g: groups.map((g) => ({ i: g.id, p: g.paths, a: g.activePath })),
        ag: activeGroupId,
        // Identity + flags only (no content) so edits don't churn the session file.
        t: tabs.map((t) => [t.path, !!t.readOnly, t.original !== undefined, t.kind ?? 'file']),
      }),
    [groups, activeGroupId, tabs],
  );

  useEffect(() => {
    // Wait until restore has settled for this folder, so we never overwrite its saved tabs with the
    // blank editor that exists briefly right after a reload. Once restore runs it mutates the store,
    // which changes `signature` and re-fires this effect — by then the guard passes.
    if (!rootPath || !sessionRestoreSettled(rootPath)) return;
    const timer = setTimeout(() => void persist(rootPath), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rootPath, signature]);
}
