import type * as monacoNs from 'monaco-editor';
import type { editor as editorNs, IDisposable } from 'monaco-editor';

/** HTML elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Languages where `<tag>` should auto-insert `</tag>`. Excludes JS/TS to avoid breaking generics. */
const TAG_LANGUAGES = new Set(['html', 'xml', 'markdown']);

/**
 * Given the text before/after the cursor (just after typing `>`), return the closing tag
 * to insert, or null. Pure for testing; the editor wiring lives in registerAutoCloseTag.
 */
export function closingTagToInsert(before: string, after: string, languageId: string): string | null {
  const m = /<([a-zA-Z][\w.:-]*)(?:\s+[^<>]*?)?>$/.exec(before);
  if (!m) return null;
  if (m[0].endsWith('/>')) return null; // self-closing
  const tag = m[1];
  if (languageId === 'html' && VOID_ELEMENTS.has(tag.toLowerCase())) return null;
  const close = `</${tag}>`;
  if (after.startsWith(close)) return null; // already closed
  return close;
}

/**
 * Auto-close HTML/XML tags: typing the `>` that completes `<tag …>` inserts `</tag>`
 * and leaves the cursor between them. Returns a disposable.
 */
export function registerAutoCloseTag(
  instance: editorNs.IStandaloneCodeEditor,
  _monaco: typeof monacoNs,
): IDisposable {
  return instance.onDidChangeModelContent((e) => {
    // React only to typing a single `>` (ignores our own `</tag>` insert, pastes, deletes).
    if (e.changes.length !== 1 || e.changes[0].text !== '>') return;
    const model = instance.getModel();
    const pos = instance.getPosition();
    if (!model || !pos || !TAG_LANGUAGES.has(model.getLanguageId())) return;

    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column,
    });
    const after = model.getValueInRange({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column,
      endLineNumber: pos.lineNumber,
      endColumn: model.getLineMaxColumn(pos.lineNumber),
    });

    const close = closingTagToInsert(before, after, model.getLanguageId());
    if (!close) return;

    instance.executeEdits('autoCloseTag', [
      {
        range: {
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        },
        text: close,
      },
    ]);
    instance.setPosition(pos); // keep the cursor between the tags
  });
}
