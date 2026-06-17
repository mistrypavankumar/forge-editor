import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';

/** When Auto Save is on, write dirty (real-path) files shortly after edits stop. */
export function useAutoSave(): void {
  const autoSave = useEditorStore((s) => s.autoSave);
  const tabs = useEditorStore((s) => s.tabs);

  useEffect(() => {
    if (!autoSave) return;
    const dirty = tabs.filter((t) => t.dirty && t.path.startsWith('/'));
    if (dirty.length === 0) return;
    const id = setTimeout(() => {
      for (const tab of dirty) {
        void window.forge.writeFile(tab.path, tab.content).then((res) => {
          if (res.ok) useEditorStore.getState().markSaved(tab.path);
        });
      }
    }, 800);
    return () => clearTimeout(id);
  }, [autoSave, tabs]);
}
