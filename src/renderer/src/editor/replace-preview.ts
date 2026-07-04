import type { editor } from 'monaco-editor';
import { buildSearchRegExp, replacementFor } from '../lib/search-regex';
import type { ReplacePreview } from '../stores/search-store';

type Monaco = typeof import('monaco-editor');

// Cap decorations so a broad query in a huge file can't stall the editor. Well past what fits on
// screen; the search itself is capped at 1000 matches, so this only bites pathological buffers.
const MAX_PREVIEW_DECORATIONS = 2000;

/**
 * Build inline decorations that preview a find/replace against the open buffer: each match gets its
 * text struck through (old) with the computed replacement rendered as green ghost text after it.
 * Mirrors the Search panel's per-line preview (highlightMatches), but against the live model so it
 * reflects unsaved edits. An empty replacement previews a deletion (strikethrough, no ghost text).
 */
export function buildReplaceDecorations(
  monaco: Monaco,
  model: editor.ITextModel,
  preview: ReplacePreview,
): editor.IModelDeltaDecoration[] {
  const re = buildSearchRegExp(preview.options);
  if (!re) return [];
  const decorations: editor.IModelDeltaDecoration[] = [];
  const lineCount = model.getLineCount();
  for (let line = 1; line <= lineCount; line++) {
    const text = model.getLineContent(line);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const replaced = replacementFor(m, re, preview.replacement);
      decorations.push({
        range: new monaco.Range(line, m.index + 1, line, m.index + m[0].length + 1),
        options: {
          inlineClassName: 'forge-replace-old',
          after: replaced ? { content: replaced, inlineClassName: 'forge-replace-new' } : undefined,
        },
      });
      if (m[0].length === 0) re.lastIndex += 1; // guard against zero-width matches
      if (decorations.length >= MAX_PREVIEW_DECORATIONS) return decorations;
    }
  }
  return decorations;
}
