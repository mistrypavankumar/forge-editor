import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { formatActiveFile } from '../lib/format-actions';

/** Delay after the last edit before auto-formatting kicks in. */
export const AUTO_FORMAT_DELAY_MS = 5000;

/**
 * When Auto Format is on, format the active file 5s after edits stop. The timer
 * resets on every content change (debounce) and is cancelled when the user switches
 * files, so only a file left dirty and idle gets formatted.
 */
export function useAutoFormat(): void {
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);

  useEffect(() => {
    if (!autoFormat || !activePath) return;
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab || !tab.dirty || tab.readOnly || tab.original !== undefined) return;
    if (!tab.path.startsWith('/')) return;
    const id = setTimeout(() => void formatActiveFile(), AUTO_FORMAT_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoFormat, activePath, tabs]);
}
