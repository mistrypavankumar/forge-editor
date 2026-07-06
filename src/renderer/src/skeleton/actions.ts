import { useEditorStore } from '../stores/editor-store';
import { useSkeletonStore, type SkeletonTarget } from '../stores/skeleton-store';
import { getActiveEditor } from '../editor/active-editor';
import { refreshTree } from '../lib/fs-actions';
import { isReactFileName, mergeSkeletonImports, skeletonFilePath } from './transform';

export { isReactFileName } from './transform';

/**
 * Renderer-side orchestration for Generate Skeleton. The command opens the modal and detects
 * components; the modal calls back into `generateSkeletonFor` (picker) and the apply helpers. All
 * IPC/parsing happens in the main process — this layer only coordinates state and applies results.
 *
 * Safety: nothing here mutates a file until the user picks an apply action from the preview.
 */

/** The active editor tab, if any (the file Generate Skeleton operates on). */
function activeReactTarget(): SkeletonTarget | null {
  const s = useEditorStore.getState();
  const tab = s.tabs.find((t) => t.path === s.activePath);
  if (!tab) return null;
  return {
    path: tab.path,
    filePath: tab.filePath ?? tab.path,
    fileName: tab.name,
    code: tab.content,
  };
}

/** Command entry point. Opens the modal, then detects components and branches. */
export async function runGenerateSkeleton(): Promise<void> {
  const target = activeReactTarget();
  const store = useSkeletonStore.getState();
  if (!target) return; // command is disabled without an active editor

  store.openModal(target);

  if (!isReactFileName(target.fileName)) {
    store.setError('Generate Skeleton is only available for React component files.');
    return;
  }

  const detected = await window.forge.skeletonDetect(target.filePath, target.code);
  if (!detected.ok) {
    store.setError(detected.error);
    return;
  }
  const components = detected.data;
  if (components.length === 0) {
    store.setError('No React component was found in this file.');
    return;
  }
  if (components.length > 1) {
    store.showPicker(components);
    return;
  }
  await generateSkeletonFor(components[0].name);
}

/** Generate (or re-generate) the skeleton for a specific component. */
export async function generateSkeletonFor(componentName: string): Promise<void> {
  const store = useSkeletonStore.getState();
  const target = store.target;
  if (!target) return;
  store.setPhase('generating');
  const res = await window.forge.skeletonGenerate({
    filePath: target.filePath,
    code: target.code,
    componentName,
    mode: 'static',
  });
  if (!res.ok) {
    store.setError(res.error);
    return;
  }
  store.setResult(componentName, res.data);
}

/**
 * Regenerate the current skeleton with the AI model ("Improve with AI"). Keeps the existing result
 * visible while the request is in flight; on success it replaces the preview, on failure it surfaces
 * a transient error without discarding what was already generated.
 */
export async function improveWithAi(): Promise<void> {
  const store = useSkeletonStore.getState();
  const target = store.target;
  const componentName = store.selected;
  if (!target || !componentName || store.aiBusy) return;
  store.beginAi();
  const res = await window.forge.skeletonGenerateAi({
    filePath: target.filePath,
    code: target.code,
    componentName,
    mode: 'ai',
  });
  if (!res.ok) {
    store.endAiError(res.error);
    return;
  }
  store.setResult(componentName, res.data);
}

// ---- Apply actions ----------------------------------------------------------

/** Insert the skeleton below the current component (append) and merge imports. Edits the buffer. */
export function applyInsertBelow(): { ok: boolean; error?: string } {
  const { target, result } = useSkeletonStore.getState();
  if (!target || !result) return { ok: false, error: 'Nothing to insert.' };

  // Use the focused editor's model when it's the target file — avoids importing the monaco module
  // at the top level (which the renderer test harness can't resolve).
  const editor = getActiveEditor();
  const model = editor?.getModel();
  const isTargetModel = model?.uri.path === target.path;
  const current = isTargetModel && model ? model.getValue() : target.code;
  const withImports = mergeSkeletonImports(current, result);
  const next = `${withImports.replace(/\s*$/, '')}\n\n${result.code.trimEnd()}\n`;

  if (isTargetModel && model) {
    // Full-model edit via a single undoable operation so the user can Cmd+Z it.
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: next }],
      () => null,
    );
    return { ok: true };
  }
  // Fallback: the file isn't open in an editor model — update the store buffer directly.
  useEditorStore.getState().updateContent(target.path, next);
  return { ok: true };
}

/** Create a new sibling skeleton file (refusing to overwrite) and open it in the editor. */
export async function applyCreateNewFile(): Promise<{ ok: boolean; error?: string; path?: string }> {
  const { target, result } = useSkeletonStore.getState();
  if (!target || !result) return { ok: false, error: 'Nothing to create.' };

  const path = skeletonFilePath(target.fileName, target.filePath, result.skeletonName);
  const name = path.slice(path.lastIndexOf('/') + 1);

  const existing = await window.forge.readFile(path);
  if (existing.ok) {
    return { ok: false, error: `A file named "${name}" already exists — pick "Insert Below" or "Copy Code" instead.` };
  }

  const header = result.fileImports ? `${result.fileImports}\n\n` : '';
  const content = `${header}${result.code.trimEnd()}\n`;
  const write = await window.forge.writeFile(path, content);
  if (!write.ok) return { ok: false, error: write.error };

  await refreshTree();
  useEditorStore.getState().openFile({ path, name, content });
  return { ok: true, path };
}

/** Copy the generated skeleton code to the clipboard. */
export async function copySkeletonCode(): Promise<boolean> {
  const { result } = useSkeletonStore.getState();
  if (!result) return false;
  try {
    await navigator.clipboard?.writeText(result.code);
    return true;
  } catch {
    return false;
  }
}
