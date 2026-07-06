import type { editor } from 'monaco-editor';
import type { BlameLine } from '@shared/ipc-contract';
import { relativeTime } from '../lib/relative-time';

type Monaco = typeof import('monaco-editor');

/** Short "author, N months ago" label shown at the end of the current line (GitLens-style). */
export function blameLabel(blame: BlameLine): string {
  return blame.time == null
    ? `${blame.author}, uncommitted`
    : `${blame.author}, ${relativeTime(blame.time)}`;
}

/**
 * A single end-of-line annotation on the cursor's line saying who last changed it, plus a hover
 * card with the commit subject and hash. Returns an empty list when there's no blame for the line
 * (untracked file, blank line past the file's end) or the line is empty — so the annotation never
 * clutters an empty line. Mirrors the injected-text pattern in `inline-run.ts`.
 */
export function buildBlameDecoration(
  monaco: Monaco,
  model: editor.ITextModel,
  line: number,
  blame: BlameLine | undefined,
): editor.IModelDeltaDecoration[] {
  if (!blame || line < 1 || line > model.getLineCount()) return [];
  if (model.getLineContent(line).trim() === '') return [];

  const label = blameLabel(blame);
  const hover =
    blame.time == null
      ? 'Uncommitted local change'
      : [`**${blame.author}** · ${relativeTime(blame.time)}`, blame.summary, blame.sha ? `\`${blame.sha}\`` : '']
          .filter(Boolean)
          .join('\n\n');

  const col = model.getLineMaxColumn(line);
  return [
    {
      range: new monaco.Range(line, col, line, col),
      options: {
        hoverMessage: { value: hover },
        after: { content: `      ${label}`, inlineClassName: 'forge-blame-inline' },
        showIfCollapsed: true,
      },
    },
  ];
}
