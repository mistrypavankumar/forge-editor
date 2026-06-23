import type { editor } from 'monaco-editor';
import type { InlineRunLog } from '@shared/ipc-contract';
import { useInlineRunStore, type InlineRunFileState } from '../stores/inline-run-store';

type Monaco = typeof import('monaco-editor');

/** Only JS/TS buffers can be evaluated by the Node-based runner. */
const RUN_LANG_IDS = new Set(['typescript', 'javascript']);
/** Wait for typing to settle before re-running — execution is far costlier than a keystroke. */
const RUN_DEBOUNCE_MS = 500;
/** Longest inline text we render per line before truncating (keeps the gutter readable). */
const MAX_INLINE_CHARS = 200;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isRunnable(model: editor.ITextModel): boolean {
  return RUN_LANG_IDS.has(model.getLanguageId());
}

/** Execute the model's current buffer now and push the captured logs into the store. */
async function runNow(model: editor.ITextModel, runExport = false): Promise<void> {
  if (model.isDisposed() || !isRunnable(model)) return;
  const path = model.uri.path;
  const store = useInlineRunStore.getState();
  store.setRunning(path, true);
  const res = await window.forge.runInline(model.getValue(), path, model.getLanguageId(), runExport);
  // The user may have toggled off or closed the file while we were running.
  if (model.isDisposed() || !useInlineRunStore.getState().enabled) return;
  if (res.ok) store.setResult(path, res.data.logs, res.data.timedOut ?? false);
  else store.setError(path, res.error);
}

/** Run immediately (e.g. on enabling the feature or switching to a file). */
export function runInlineNow(model: editor.ITextModel): void {
  void runNow(model);
}

/** Run an exported function from the model (main, default export, or single export). */
export function runInlineExport(model: editor.ITextModel): void {
  void runNow(model, true);
}

/** Debounced run, called on every edit while the feature is enabled. */
export function scheduleInlineRun(model: editor.ITextModel): void {
  if (model.isDisposed() || !isRunnable(model)) return;
  const path = model.uri.path;
  const existing = debounceTimers.get(path);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path);
      void runNow(model);
    }, RUN_DEBOUNCE_MS),
  );
}

/** Cancel any pending run for a path (on close, or when the feature is switched off). */
export function cancelInlineRun(path: string): void {
  const timer = debounceTimers.get(path);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(path);
  }
}

/** Collapse a captured value to a single line and clamp its length for inline display. */
function oneLine(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, ' ↵ ').trim();
  return flat.length > MAX_INLINE_CHARS ? `${flat.slice(0, MAX_INLINE_CHARS)}…` : flat;
}

/**
 * Turn the captured logs into end-of-line injected-text decorations — Quokka-style output sitting
 * to the right of the code that produced it. Multiple logs on one line are joined; an error on the
 * line colours it red. Logs the runner couldn't place (line === null, e.g. a top-level syntax
 * error) are pinned to line 1 so they're never lost.
 */
export function buildRunDecorations(
  monaco: Monaco,
  model: editor.ITextModel,
  state: InlineRunFileState,
): editor.IModelDeltaDecoration[] {
  const lineCount = model.getLineCount();
  const byLine = new Map<number, InlineRunLog[]>();
  for (const log of state.logs) {
    const line = Math.min(Math.max(log.line ?? 1, 1), lineCount);
    const list = byLine.get(line);
    if (list) list.push(log);
    else byLine.set(line, [log]);
  }
  if (state.error) {
    const list = byLine.get(1) ?? [];
    list.unshift({ line: 1, level: 'error', text: state.error });
    byLine.set(1, list);
  }

  const decorations: editor.IModelDeltaDecoration[] = [];
  for (const [line, logs] of byLine) {
    const hasError = logs.some((l) => l.level === 'error');
    const content = oneLine(logs.map((l) => l.text).join('  '));
    const col = model.getLineMaxColumn(line);
    decorations.push({
      range: new monaco.Range(line, col, line, col),
      options: {
        // Hover shows the full, untruncated output (each log on its own line).
        hoverMessage: { value: logs.map((l) => l.text).join('\n') },
        after: {
          content: `  ${content}`,
          inlineClassName: hasError ? 'forge-inline-run-error' : 'forge-inline-run',
        },
        showIfCollapsed: true,
      },
    });
  }
  if (state.timedOut) {
    const col = model.getLineMaxColumn(lineCount);
    decorations.push({
      range: new monaco.Range(lineCount, col, lineCount, col),
      options: {
        after: { content: '  ⏱ execution timed out', inlineClassName: 'forge-inline-run-error' },
        showIfCollapsed: true,
      },
    });
  }
  return decorations;
}
