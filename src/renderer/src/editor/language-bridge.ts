import type * as monacoNs from 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { LsDiagnostic } from '@shared/ipc-contract';
import { refreshGraphqlDiagnostics, GRAPHQL_MARKER_OWNER } from './graphql-diagnostics';

/** Marker owner for inline diagnostics from the main-process language backends (TS LS + jdtls). */
const TS_MARKER_OWNER = 'forge-ts';
const LANG_IDS = new Set(['typescript', 'javascript', 'java']);
/** Time to wait after edits stop before re-syncing the buffer + recomputing diagnostics. */
const SYNC_DEBOUNCE_MS = 300;
/** Skip whole-file diagnostics above this size — a full type-check pass gets too costly. */
export const LARGE_FILE_CHARS = 500_000;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Paths whose buffer is currently registered with the main-process LS (open document). */
const registeredPaths = new Set<string>();

function isTsModel(model: editor.ITextModel): boolean {
  return LANG_IDS.has(model.getLanguageId());
}

/** Tell the main process which workspace to build a Language Service for. */
export function initLanguageProject(rootPath: string): void {
  void window.forge.editorLanguage.initializeProject(rootPath);
}

/**
 * Register a model as an open document and run a first diagnostics pass. Idempotent: calling it for
 * an already-registered path is a no-op, so a tab that adopts a model pre-created for a go-to-def
 * preview (see monaco-providers `ensureModelsFor`) still gets registered exactly once.
 */
export function openLanguageDocument(monaco: typeof monacoNs, model: editor.ITextModel): void {
  if (!isTsModel(model)) return;
  const path = model.uri.path;
  if (registeredPaths.has(path)) return;
  registeredPaths.add(path);
  window.forge.editorLanguage.openDocument(path, model.getValue());
  void refreshDiagnostics(monaco, model);
}

/** Stop tracking a closed buffer and clear its inline markers. */
export function closeLanguageDocument(path: string): void {
  registeredPaths.delete(path);
  window.forge.editorLanguage.closeDocument(path);
  const timer = debounceTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(path);
  }
}

/**
 * Push the live buffer to the Language Service immediately on every edit. This is a cheap
 * fire-and-forget message and MUST stay un-debounced so completions/hover/signature-help (which
 * fire per keystroke) are computed against exactly what the user just typed — not stale text.
 */
export function updateLanguageDocument(model: editor.ITextModel): void {
  if (model.isDisposed() || !isTsModel(model)) return;
  window.forge.editorLanguage.updateDocument(model.uri.path, model.getValue());
}

/**
 * Debounced inline-diagnostics refresh. A full type-check pass is expensive, so unlike the buffer
 * sync above we wait for typing to settle before recomputing squiggles.
 */
export function scheduleDiagnostics(monaco: typeof monacoNs, model: editor.ITextModel): void {
  if (model.isDisposed() || !isTsModel(model)) return;
  const path = model.uri.path;
  const existing = debounceTimers.get(path);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path);
      void refreshDiagnostics(monaco, model);
    }, SYNC_DEBOUNCE_MS),
  );
}

function toMarkerSeverity(monaco: typeof monacoNs, d: LsDiagnostic): monacoNs.MarkerSeverity {
  // Unused code (TS6133 and friends) reads as a hint: Monaco fades the text via the Unnecessary
  // tag and — at Hint severity — draws no colored squiggle, matching the standard "greyed-out
  // unused symbol" look instead of an alarming red underline.
  if (d.reportsUnnecessary) return monaco.MarkerSeverity.Hint;
  if (d.severity === 'error') return monaco.MarkerSeverity.Error;
  if (d.severity === 'warning') return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
}

/** Map TS's unused/deprecated hints to Monaco marker tags (fade / strikethrough). */
function toMarkerTags(monaco: typeof monacoNs, d: LsDiagnostic): monacoNs.MarkerTag[] | undefined {
  const tags: monacoNs.MarkerTag[] = [];
  if (d.reportsUnnecessary) tags.push(monaco.MarkerTag.Unnecessary);
  if (d.reportsDeprecated) tags.push(monaco.MarkerTag.Deprecated);
  return tags.length ? tags : undefined;
}

/** Fetch diagnostics for a model from the LS and apply them as inline squiggle markers. */
export async function refreshDiagnostics(
  monaco: typeof monacoNs,
  model: editor.ITextModel,
): Promise<void> {
  if (model.isDisposed() || !isTsModel(model)) return;
  if (model.getValueLength() > LARGE_FILE_CHARS) {
    monaco.editor.setModelMarkers(model, TS_MARKER_OWNER, []);
    monaco.editor.setModelMarkers(model, GRAPHQL_MARKER_OWNER, []);
    return;
  }
  // Validate embedded `gql` templates in the renderer (the TS LS ignores template contents). Cheap
  // and synchronous, so run it before the awaited LS round-trip for snappy squiggles.
  refreshGraphqlDiagnostics(monaco, model);
  const res = await window.forge.editorLanguage.getDiagnostics(model.uri.path);
  if (!res.ok || model.isDisposed()) return;
  // The TS LS reports numeric error codes (shown as "TS2345"); jdtls codes aren't TS, so
  // only the TS/JS backends get the TS-prefixed code in the marker message.
  const isTs = model.getLanguageId() === 'typescript' || model.getLanguageId() === 'javascript';
  monaco.editor.setModelMarkers(
    model,
    TS_MARKER_OWNER,
    res.data.map((d) => ({
      severity: toMarkerSeverity(monaco, d),
      message: isTs && typeof d.code === 'number' ? `${d.message} (TS${d.code})` : d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
      tags: toMarkerTags(monaco, d),
    })),
  );
}
