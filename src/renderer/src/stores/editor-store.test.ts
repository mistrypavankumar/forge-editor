import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor-store';

const reset = () => useEditorStore.setState({ tabs: [], activePath: null });
const sample = { path: '/p/a.ts', name: 'a.ts', content: 'x' };

describe('editor-store', () => {
  beforeEach(reset);

  it('openFile adds a tab and activates it', () => {
    useEditorStore.getState().openFile(sample);
    const s = useEditorStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activePath).toBe('/p/a.ts');
    expect(s.tabs[0].dirty).toBe(false);
  });

  it('openFile on an already-open path does not duplicate, just activates', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().setActive('/p/a.ts');
    useEditorStore.getState().openFile(sample);
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().activePath).toBe('/p/a.ts');
  });

  it('updateContent marks the tab dirty', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().updateContent('/p/a.ts', 'changed');
    const tab = useEditorStore.getState().tabs[0];
    expect(tab.content).toBe('changed');
    expect(tab.dirty).toBe(true);
  });

  it('markSaved clears dirty', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().updateContent('/p/a.ts', 'changed');
    useEditorStore.getState().markSaved('/p/a.ts');
    expect(useEditorStore.getState().tabs[0].dirty).toBe(false);
  });

  it('closeFile removes the tab and picks a neighbor as active', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().openFile({ path: '/p/b.ts', name: 'b.ts', content: 'y' });
    useEditorStore.getState().closeFile('/p/b.ts');
    const s = useEditorStore.getState();
    expect(s.tabs.map((t) => t.path)).toEqual(['/p/a.ts']);
    expect(s.activePath).toBe('/p/a.ts');
  });

  it('closing the last tab sets activePath to null', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().closeFile('/p/a.ts');
    expect(useEditorStore.getState().activePath).toBeNull();
  });
});
