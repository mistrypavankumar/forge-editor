import type * as monacoNs from 'monaco-editor';
import { useFormatterStore } from '../stores/formatter-store';
import { formatTextWith } from '../lib/format-text';

/** Languages our CLI formatters (prettier/eslint/biome/dprint) can handle. */
const FORMAT_LANGUAGES = [
  'typescript', 'javascript', 'json', 'jsonc', 'css', 'scss', 'less', 'html', 'markdown', 'yaml',
];

let registered = false;

/**
 * Register a Monaco document-formatting provider backed by the project's selected formatter.
 * This makes the native "Format Document" action (context menu + Shift+Alt+F) work by piping
 * the buffer through the formatter's stdin mode and applying the result as an edit.
 */
export function registerFormatProvider(monaco: typeof monacoNs): void {
  if (registered) return;
  registered = true;
  monaco.languages.registerDocumentFormattingEditProvider(FORMAT_LANGUAGES, {
    displayName: 'Forge',
    async provideDocumentFormattingEdits(model) {
      const text = model.getValue();
      const formatted = await formatTextWith(
        useFormatterStore.getState().selectedId,
        model.uri.path,
        text,
      );
      if (formatted == null || formatted === text) return [];
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  });
}
