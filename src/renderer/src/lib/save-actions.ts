import { useEditorStore } from '../stores/editor-store';
import { maybeFormatOnSave } from './format-actions';

/** Write all dirty, editable, on-disk files to disk (respecting format-on-save). */
export async function saveAllFiles(): Promise<void> {
  const state = useEditorStore.getState();
  const dirty = state.tabs.filter((t) => t.dirty && !t.readOnly && t.path.startsWith('/'));
  for (const tab of dirty) {
    const res = await window.forge.writeFile(tab.path, tab.content);
    if (res.ok) {
      state.markSaved(tab.path);
      await maybeFormatOnSave(tab.path);
    }
  }
}
