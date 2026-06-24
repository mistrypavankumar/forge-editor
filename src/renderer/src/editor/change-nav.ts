import type { editor } from 'monaco-editor';
import type { DiffHunk } from '../lib/line-diff';
import { hunkLine } from './git-gutter';

// Each live editor instance publishes a getter for its current git-change hunks here, so the
// global next/prev-change commands (and the floating buttons) can navigate whichever editor is
// focused without threading the per-component hunk state through the command registry.
const hunkSources = new WeakMap<editor.IStandaloneCodeEditor, () => DiffHunk[]>();

export function registerHunkSource(
  instance: editor.IStandaloneCodeEditor,
  getHunks: () => DiffHunk[],
): void {
  hunkSources.set(instance, getHunks);
}

export function unregisterHunkSource(instance: editor.IStandaloneCodeEditor): void {
  hunkSources.delete(instance);
}

/**
 * Move the cursor to the next (`dir: 1`) or previous (`dir: -1`) git-changed region in `instance`
 * and center it in the viewport. Wraps around the ends, so repeated presses cycle through every
 * change. No-ops when the editor has no tracked changes.
 */
export function goToChange(instance: editor.IStandaloneCodeEditor | null, dir: 1 | -1): void {
  if (!instance) return;
  const hunks = hunkSources.get(instance)?.() ?? [];
  if (hunks.length === 0) return;
  // computeDiff emits hunks in document order, so these lines are already ascending.
  const lines = hunks.map(hunkLine);
  const cur = instance.getPosition()?.lineNumber ?? 1;
  let target: number;
  if (dir === 1) {
    target = lines.find((l) => l > cur) ?? lines[0];
  } else {
    target = [...lines].reverse().find((l) => l < cur) ?? lines[lines.length - 1];
  }
  instance.revealLineInCenter(target);
  instance.setPosition({ lineNumber: target, column: 1 });
  instance.focus();
}
