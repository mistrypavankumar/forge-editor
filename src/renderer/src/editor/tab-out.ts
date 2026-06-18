import type { editor as editorNs, IDisposable } from 'monaco-editor';

/** Closing characters that Tab should jump over when the cursor sits right before one. */
const TAB_OUT_CHARS = new Set([')', ']', '}', '>', '"', "'", '`']);

export function isTabOutChar(ch: string): boolean {
  return TAB_OUT_CHARS.has(ch);
}

/**
 * Tab-out: pressing Tab while the cursor is immediately before a closing bracket/quote
 * moves past it instead of inserting indentation. Skipped when the suggest widget is open
 * (Tab accepts the completion) or there's a selection (Tab indents). Returns a disposable.
 */
export function registerTabOut(instance: editorNs.IStandaloneCodeEditor): IDisposable {
  return instance.onKeyDown((e) => {
    if (e.browserEvent.key !== 'Tab' || e.browserEvent.shiftKey) return;

    // Let Tab accept an open autocomplete suggestion rather than jumping out.
    if (instance.getDomNode()?.querySelector('.suggest-widget.visible')) return;

    const selection = instance.getSelection();
    const model = instance.getModel();
    const pos = instance.getPosition();
    if (!model || !pos || !selection || !selection.isEmpty()) return;
    if (pos.column >= model.getLineMaxColumn(pos.lineNumber)) return; // nothing to the right

    const charAfter = model.getValueInRange({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column + 1,
    });
    if (!isTabOutChar(charAfter)) return;

    e.preventDefault();
    e.stopPropagation();
    instance.setPosition({ lineNumber: pos.lineNumber, column: pos.column + 1 });
  });
}
