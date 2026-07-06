import type { ProjectDiagnostic, SearchMatch } from '@shared/ipc-contract';
import { useEditorStore } from '../stores/editor-store';

/**
 * The agent's internal tool interface. These are thin, side-effect-focused wrappers over the
 * existing `window.forge` IPC surface and the editor store — the same primitives the rest of the
 * app uses, so the agent can't reach anything the user couldn't. The orchestrator wraps each call
 * with timeline tracking; keeping the tools themselves plain makes them easy to reason about.
 *
 * Path convention: `absPath` is a real on-disk path; `relPath` is workspace-relative (for display
 * and for matching model output). Draft writes never touch disk here — `applyFileWrite` is only
 * called once the user approves a specific patch.
 */

/** Join a workspace root and a relative path with POSIX separators (renderer has no node:path). */
export function joinPath(rootPath: string, relPath: string): string {
  const root = rootPath.replace(/\/+$/, '');
  const rel = relPath.replace(/^\/+/, '');
  return `${root}/${rel}`;
}

/** Make an absolute path workspace-relative for display; returns `absPath` unchanged if outside. */
export function toRelative(rootPath: string, absPath: string): string {
  const root = rootPath.replace(/\/+$/, '') + '/';
  return absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
}

/** Source-file extensions worth showing the model in the workspace snapshot. */
const SOURCE_EXT =
  /\.(tsx?|jsx?|mjs|cjs|json|graphql|gql|java|kt|css|scss|less|html|md|mdx|ya?ml|prisma|sql|vue|svelte)$/i;

/** listFiles: workspace-relative source-file paths (capped), for the plan-phase snapshot. */
export async function listWorkspaceFiles(rootPath: string, limit = 600): Promise<string[]> {
  const res = await window.forge.listFiles(rootPath);
  if (!res.ok) throw new Error(res.error);
  return res.data
    .map((f) => f.relPath)
    .filter((p) => SOURCE_EXT.test(p))
    .slice(0, limit);
}

/** readFile: current on-disk contents of a file, or null when it does not exist. */
export async function readWorkspaceFile(absPath: string): Promise<string | null> {
  const res = await window.forge.readFile(absPath);
  return res.ok ? res.data : null;
}

/** searchFiles: literal, case-insensitive workspace search for grounding the plan. */
export async function searchWorkspace(rootPath: string, query: string): Promise<SearchMatch[]> {
  const res = await window.forge.search(rootPath, {
    query,
    regex: false,
    caseSensitive: false,
    wholeWord: false,
  });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/** getOpenEditors: the currently open non-synthetic file tabs, marking the active one. */
export function getOpenEditors(): { path: string; name: string; content: string; active: boolean }[] {
  const s = useEditorStore.getState();
  return s.tabs
    .filter((t) => t.path.startsWith('/') && !t.readOnly && t.kind !== 'api-explorer')
    .map((t) => ({ path: t.path, name: t.name, content: t.content, active: t.path === s.activePath }));
}

/** getDiagnostics: project-wide type/lint diagnostics (empty on failure — best-effort context). */
export async function getWorkspaceDiagnostics(rootPath: string): Promise<ProjectDiagnostic[]> {
  const res = await window.forge.runDiagnostics(rootPath);
  return res.ok ? res.data : [];
}

/**
 * applyPatch: write approved content to disk. If the file is open in the editor, its buffer is
 * updated in place (and marked saved) so the user sees the change without a reload.
 */
export async function applyFileWrite(absPath: string, content: string): Promise<void> {
  const res = await window.forge.writeFile(absPath, content);
  if (!res.ok) throw new Error(res.error);
  const editor = useEditorStore.getState();
  if (editor.tabs.some((t) => t.path === absPath)) {
    editor.updateContent(absPath, content);
    editor.markSaved(absPath);
  }
}

/** showDiff: open a read-only side-by-side diff tab (before vs proposed) in the main editor area. */
export function openDiffTab(absPath: string, name: string, before: string, after: string): void {
  useEditorStore.getState().openFile({
    // Synthetic path so it doesn't collide with the real editable tab.
    path: `agent-diff:${absPath}`,
    name: `${name} (proposed)`,
    content: after,
    original: before,
    readOnly: true,
    // Real path drives Monaco's language detection for the diff.
    filePath: absPath,
  });
}
