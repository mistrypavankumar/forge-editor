import { useEditorStore } from '../stores/editor-store';

/** Open a navigator entry: focus an already-open tab by name, else open a mock tab. */
export function openEntry(name: string, dir: string): void {
  const { tabs, setActive, openFile } = useEditorStore.getState();
  const existing = tabs.find((t) => t.name === name);
  if (existing) {
    setActive(existing.path);
    return;
  }
  openFile({
    path: `/${dir}/${name}`.replace(/\/+/g, '/'),
    name,
    content: `// ${name}\n// ${dir}\n`,
  });
}
