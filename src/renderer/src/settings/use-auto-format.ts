import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { formatActiveFile, isFormattable } from '../lib/format-actions';

/** Delay after the last edit before auto-formatting kicks in. */
export const AUTO_FORMAT_DELAY_MS = 5000;

/**
 * When Auto Format is on, format the active file 5s after edits stop.
 *
 * Driven by content changes (not the transient `dirty` flag) so that saving — manually
 * or via Auto Save — within the window doesn't cancel the format. A per-file baseline of
 * the last opened/formatted content prevents formatting freshly-opened files and avoids a
 * re-trigger loop after the formatter writes back.
 */
export function useAutoFormat(): void {
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const baselineRef = useRef<Map<string, string>>(new Map());

  // Seed the baseline with a file's content the first time it becomes active, so opening
  // a file (or switching to it) never triggers a format on its own.
  useEffect(() => {
    if (!activePath) return;
    const tab = useEditorStore.getState().tabs.find((t) => t.path === activePath);
    if (tab && !baselineRef.current.has(activePath)) {
      baselineRef.current.set(activePath, tab.content);
    }
  }, [activePath]);

  useEffect(() => {
    if (!autoFormat || !activePath) return;
    const tab = tabs.find((t) => t.path === activePath);
    if (!isFormattable(tab)) return;
    const baseline = baselineRef.current.get(activePath);
    // No baseline yet (the seeding effect runs first on mount) or unchanged since last format.
    if (baseline === undefined || baseline === tab.content) return;

    const id = setTimeout(() => {
      void formatActiveFile().then(() => {
        const latest = useEditorStore.getState().tabs.find((t) => t.path === activePath);
        baselineRef.current.set(activePath, latest ? latest.content : tab.content);
      });
    }, AUTO_FORMAT_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoFormat, activePath, tabs]);
}
