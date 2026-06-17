import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { useEditorStore } from './stores/editor-store';
import { SEED_FILES, SAMPLE_FILE_PATH } from './data/sample-code';

export function App(): React.JSX.Element {
  // Seed a few realistic files so the workspace looks lived-in before a folder is opened.
  useEffect(() => {
    const store = useEditorStore.getState();
    if (store.tabs.length > 0) return;
    SEED_FILES.forEach((f) => store.openFile(f));
    store.setActive(SAMPLE_FILE_PATH);
  }, []);

  return <AppShell />;
}
