import type * as monacoNs from 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { LsDiagnostic } from '@shared/ipc-contract';

/** Marker owner for inline diagnostics from the main-process Language Service. */
const TS_MARKER_OWNER = 'forge-ts';
const LANG_IDS = new Set(['typescript', 'javascript']);
/** Time to wait after edits stop before re-syncing the buffer + recomputing diagnostics. */
const SYNC_DEBOUNCE_MS = 300;
/** Skip whole-file diagnostics above this size — a full type-check pass gets too costly. */
export const LARGE_FILE_CHARS = 500_000;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isTsModel(model: editor.ITextModel): boolean {
  return LANG_IDS.has(model.getLanguageId());
}

/** Tell the main process which workspace to build a Language Service for. */
export function initLanguageProject(rootPath: string): void {
  void window.forge.editorLanguage.initializeProject(rootPath);
}

/** Register a freshly created model as an open document and run a first diagnostics pass. */
export function openLanguageDocument(monaco: typeof monacoNs, model: editor.ITextModel): void {
  if (!isTsModel(model)) return;
  window.forge.editorLanguage.openDocument(model.uri.path, model.getValue());
  void refreshDiagnostics(monaco, model);
}

/** Stop tracking a closed buffer and clear its inline markers. */
export function closeLanguageDocument(path: string): void {
  window.forge.editorLanguage.closeDocument(path);
  const timer = debounceTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(path);
  }
}

/**
 * Debounced: push the live buffer to the Language Service, then refresh inline diagnostics.
 * Keeps the renderer responsive while typing — nothing blocks on the LS round-trip.
 */
export function syncLanguageDocument(monaco: typeof monacoNs, model: editor.ITextModel): void {
  if (model.isDisposed() || !isTsModel(model)) return;
  const path = model.uri.path;
  const existing = debounceTimers.get(path);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path);
      if (model.isDisposed()) return;
      window.forge.editorLanguage.updateDocument(path, model.getValue());
      void refreshDiagnostics(monaco, model);
    }, SYNC_DEBOUNCE_MS),
  );
}

function toMarkerSeverity(monaco: typeof monacoNs, d: LsDiagnostic): monacoNs.MarkerSeverity {
  if (d.severity === 'error') return monaco.MarkerSeverity.Error;
  if (d.severity === 'warning') return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
}

/** Fetch diagnostics for a model from the LS and apply them as inline squiggle markers. */
export async function refreshDiagnostics(
  monaco: typeof monacoNs,
  model: editor.ITextModel,
): Promise<void> {
  if (model.isDisposed() || !isTsModel(model)) return;
  if (model.getValueLength() > LARGE_FILE_CHARS) {
    monaco.editor.setModelMarkers(model, TS_MARKER_OWNER, []);
    return;
  }
  const res = await window.forge.editorLanguage.getDiagnostics(model.uri.path);
  if (!res.ok || model.isDisposed()) return;
  monaco.editor.setModelMarkers(
    model,
    TS_MARKER_OWNER,
    res.data.map((d) => ({
      severity: toMarkerSeverity(monaco, d),
      message: typeof d.code === 'number' ? `${d.message} (TS${d.code})` : d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
    })),
  );
}
