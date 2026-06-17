import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { useEditorStore } from './stores/editor-store';
import { SAMPLE_CODE, SAMPLE_FILE_NAME, SAMPLE_FILE_PATH } from './data/sample-code';

export function App(): React.JSX.Element {
  // Seed a realistic file so the workspace looks alive before a folder is opened.
  useEffect(() => {
    const { tabs, openFile } = useEditorStore.getState();
    if (tabs.length === 0) {
      openFile({ path: SAMPLE_FILE_PATH, name: SAMPLE_FILE_NAME, content: SAMPLE_CODE });
    }
  }, []);

  return <AppShell />;
}
