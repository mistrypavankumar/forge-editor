import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor-store';

const reset = () =>
  useEditorStore.setState({
    tabs: [],
    activePath: null,
    closedStack: [],
    groups: [{ id: 'main', paths: [], activePath: null }],
    activeGroupId: 'main',
  });
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

  it('records closed real files and takeClosed pops the most recent', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().openFile({ path: '/p/b.ts', name: 'b.ts', content: 'y' });
    useEditorStore.getState().closeFile('/p/a.ts');
    useEditorStore.getState().closeFile('/p/b.ts');
    expect(useEditorStore.getState().takeClosed()).toBe('/p/b.ts');
    expect(useEditorStore.getState().takeClosed()).toBe('/p/a.ts');
    expect(useEditorStore.getState().takeClosed()).toBeNull();
  });

  it('does not record untitled (non-disk) files as closable', () => {
    useEditorStore.getState().openFile({ path: 'Untitled-1', name: 'Untitled-1', content: '' });
    useEditorStore.getState().closeFile('Untitled-1');
    expect(useEditorStore.getState().closedStack).toEqual([]);
  });

  it('cycleTab wraps around the open tabs', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().openFile({ path: '/p/b.ts', name: 'b.ts', content: 'y' });
    useEditorStore.getState().setActive('/p/b.ts');
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activePath).toBe('/p/a.ts');
    useEditorStore.getState().cycleTab(-1);
    expect(useEditorStore.getState().activePath).toBe('/p/b.ts');
  });

  it('splitRight opens the active file in a second group and focuses it', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().splitRight();
    const s = useEditorStore.getState();
    expect(s.groups.map((g) => g.id)).toEqual(['main', 'right']);
    expect(s.activeGroupId).toBe('right');
    expect(s.groups[1].paths).toEqual(['/p/a.ts']);
    // The document is shared, not duplicated.
    expect(s.tabs).toHaveLength(1);
  });

  it('opening a file targets the active (right) group after splitting', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().splitRight();
    useEditorStore.getState().openFile({ path: '/p/b.ts', name: 'b.ts', content: 'y' });
    const s = useEditorStore.getState();
    expect(s.groups.find((g) => g.id === 'right')?.paths).toEqual(['/p/a.ts', '/p/b.ts']);
    expect(s.groups.find((g) => g.id === 'main')?.paths).toEqual(['/p/a.ts']);
  });

  it('a file open in both groups stays in tabs until closed in both', () => {
    useEditorStore.getState().openFile(sample);
    useEditorStore.getState().splitRight();
    // Close it in the right group — still open in main.
    useEditorStore.getState().closeFile('/p/a.ts', 'right');
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    // The emptied right group collapses.
    expect(useEditorStore.getState().groups.map((g) => g.id)).toEqual(['main']);
    // Close it in main too — now the document is gone.
    useEditorStore.getState().closeFile('/p/a.ts', 'main');
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });
});
