import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { saveAllFiles } from '../lib/save-actions';

/**
 * When Auto Save is on, persist dirty files when focus leaves the window (e.g. switching
 * apps). Losing focus *within* the app (clicking the sidebar, etc.) is handled by the
 * editor's own blur handler in CodeEditor.
 */
export function useAutoSave(): void {
  const autoSave = useEditorStore((s) => s.autoSave);

  useEffect(() => {
    if (!autoSave) return;
    const onBlur = (): void => void saveAllFiles();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [autoSave]);
}
