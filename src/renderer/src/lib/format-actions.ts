import { useEditorStore, type OpenFile } from '../stores/editor-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useFormatterStore } from '../stores/formatter-store';
import { FORMATTERS, resolveFormatterForFile } from './detect-formatters';

/** Only real, editable on-disk files can be formatted — not diffs, read-only views, or untitled buffers. */
export function isFormattable(tab: OpenFile | undefined): tab is OpenFile {
  return !!tab && !tab.readOnly && tab.original === undefined && tab.path.startsWith('/');
}

/** Format the active editor file with the selected formatter. */
export async function formatActiveFile(): Promise<void> {
  const editor = useEditorStore.getState();
  const tab = editor.tabs.find((t) => t.path === editor.activePath);
  if (!isFormattable(tab)) return;
  await formatPath(tab.path);
}

/** Run the selected formatter after a save, when "Format on Save" is enabled. */
export async function maybeFormatOnSave(path: string): Promise<void> {
  if (!useFormatterStore.getState().formatOnSave) return;
  if (!path.startsWith('/')) return;
  await formatPath(path);
}

async function formatPath(path: string): Promise<void> {
  const rootPath = useWorkspaceStore.getState().rootPath;
  if (!rootPath) return;

  const formatter = useFormatterStore.getState();
  const def = FORMATTERS[resolveFormatterForFile(formatter.selectedId, path, formatter.available)];

  // Formatters read from disk, so flush any unsaved buffer first to avoid formatting stale content.
  const editor = useEditorStore.getState();
  const tab = editor.tabs.find((t) => t.path === path);
  if (tab?.dirty) {
    const write = await window.forge.writeFile(path, tab.content);
    if (!write.ok) {
      formatter.setError(write.error);
      return;
    }
    editor.markSaved(path);
  }

  try {
    const res = await window.forge.runFormatter(rootPath, def.tool, def.args(path));
    if (!res.ok) {
      formatter.setError(res.error);
      return;
    }

    // Pull the formatted content back into the editor and mark the buffer clean.
    const read = await window.forge.readFile(path);
    if (read.ok) useEditorStore.getState().requestRevert(path, read.data);

    formatter.setError(res.data.code === 0 ? null : res.data.stderr || `exit code ${res.data.code}`);
  } catch (e) {
    formatter.setError(e instanceof Error ? e.message : String(e));
  }
}
