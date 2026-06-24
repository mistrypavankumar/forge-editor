import type { editor, IRange } from 'monaco-editor';
import type { DiffHunk } from '../lib/line-diff';

type Monaco = typeof import('monaco-editor');

// The current-document line a deletion marker attaches to: the line just above
// the gap, or line 1 when content was removed from the very top of the file.
function delMarkerLine(hunk: DiffHunk): number {
  return hunk.modStart >= 1 ? hunk.modStart : 1;
}

/** The 1-based editor line a hunk's gutter marker sits on — the jump target for change navigation. */
export function hunkLine(hunk: DiffHunk): number {
  return hunk.type === 'del' ? delMarkerLine(hunk) : hunk.modStart + 1;
}

/** Does this hunk own the given 1-based editor line (for click-to-revert routing)? */
export function hunkAtLine(hunk: DiffHunk, line: number): boolean {
  if (hunk.type === 'del') return delMarkerLine(hunk) === line;
  return line >= hunk.modStart + 1 && line <= hunk.modEnd;
}

export function hunkToDecoration(
  hunk: DiffHunk,
  monaco: Monaco,
): editor.IModelDeltaDecoration {
  if (hunk.type === 'del') {
    const line = delMarkerLine(hunk);
    return {
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'forge-git-gutter forge-git-del',
        glyphMarginHoverMessage: { value: 'Click the gutter to restore the deleted line(s)' },
      },
    };
  }
  const cls = hunk.type === 'add' ? 'forge-git-add' : 'forge-git-mod';
  return {
    range: new monaco.Range(hunk.modStart + 1, 1, hunk.modEnd, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `forge-git-gutter ${cls}`,
    },
  };
}

/** Replace the hunk's current lines with the original (HEAD) lines, as an undoable edit. */
export function revertHunk(
  instance: editor.IStandaloneCodeEditor,
  hunk: DiffHunk,
  monaco: Monaco,
): void {
  const model = instance.getModel();
  if (!model) return;
  const lineCount = model.getLineCount();
  const eol = model.getEOL();
  const orig = hunk.origLines;

  let range: IRange;
  let text: string;
  if (hunk.modStart >= lineCount) {
    // Restoring lines removed at the very end of the file: append after the last line.
    const col = model.getLineMaxColumn(lineCount);
    range = new monaco.Range(lineCount, col, lineCount, col);
    text = eol + orig.join(eol);
  } else if (hunk.modEnd < lineCount) {
    range = new monaco.Range(hunk.modStart + 1, 1, hunk.modEnd + 1, 1);
    text = orig.length ? orig.join(eol) + eol : '';
  } else {
    // The hunk runs through the final line — anchor the edit to its end column.
    const col = model.getLineMaxColumn(lineCount);
    range = new monaco.Range(hunk.modStart + 1, 1, lineCount, col);
    text = orig.join(eol);
  }

  instance.executeEdits('git-revert', [{ range, text, forceMoveMarkers: true }]);
  instance.pushUndoStop();
}
