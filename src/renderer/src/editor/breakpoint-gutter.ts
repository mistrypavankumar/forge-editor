import type { editor } from 'monaco-editor';

type Monaco = typeof import('monaco-editor');

/**
 * Glyph-margin dots for the breakpoints in a file. A breakpoint the backend hasn't been able to
 * bind (no matching code on that line, or no session yet) renders hollow via `forge-bp-unverified`.
 */
export function breakpointDecorations(
  monaco: Monaco,
  lines: number[],
  verified: number[] | undefined,
): editor.IModelDeltaDecoration[] {
  // Before a session confirms binding we have no verified list — show solid (optimistic).
  const verifiedSet = verified ? new Set(verified) : null;
  return lines.map((line) => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName:
        verifiedSet && !verifiedSet.has(line) ? 'forge-bp forge-bp-unverified' : 'forge-bp',
      glyphMarginHoverMessage: { value: 'Breakpoint' },
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  }));
}

/** Whole-line highlight + arrow for the line execution is currently paused on. */
export function currentLineDecoration(monaco: Monaco, line: number): editor.IModelDeltaDecoration {
  return {
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      className: 'forge-debug-line',
      glyphMarginClassName: 'forge-debug-arrow',
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  };
}
