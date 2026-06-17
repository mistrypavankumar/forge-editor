import { commandRegistry } from './command-registry';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFolderDialog, openFileDialog } from '../lib/workspace-actions';
import { newFile } from '../lib/fs-actions';

let untitledSeq = 0;

function isUntitled(path: string): boolean {
  return !path.startsWith('/');
}

export async function saveActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab) return;
  if (isUntitled(tab.path)) {
    const res = await window.forge.saveDialog(tab.name);
    if (!res.ok || !res.data) return;
    const path = res.data;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const w = await window.forge.writeFile(path, tab.content);
    if (w.ok) state.renameTab(tab.path, path, name);
    return;
  }
  const res = await window.forge.writeFile(tab.path, tab.content);
  if (res.ok) state.markSaved(tab.path);
}

export function newTextFile(): void {
  untitledSeq += 1;
  const name = `Untitled-${untitledSeq}`;
  useEditorStore.getState().openFile({ path: name, name, content: '' });
}

export async function revertActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab || isUntitled(tab.path)) return;
  const res = await window.forge.readFile(tab.path);
  if (res.ok) state.requestRevert(tab.path, res.data);
}

function closeActiveEditor(): void {
  const state = useEditorStore.getState();
  if (state.activePath) state.closeFile(state.activePath);
}

export function registerCoreCommands(): void {
  commandRegistry.register({
    id: 'file.save',
    title: 'Save File',
    category: 'File',
    run: saveActiveFile,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'file.newTextFile',
    title: 'New Text File',
    category: 'File',
    run: newTextFile,
  });
  commandRegistry.register({
    id: 'file.newFile',
    title: 'New File…',
    category: 'File',
    run: () => {
      const ws = useWorkspaceStore.getState();
      if (ws.rootPath) void newFile(ws.selectedDir ?? ws.rootPath);
    },
  });
  commandRegistry.register({
    id: 'file.openFile',
    title: 'Open File…',
    category: 'File',
    run: () => openFileDialog(),
  });
  commandRegistry.register({
    id: 'file.openFolder',
    title: 'Open Folder…',
    category: 'File',
    run: () => openFolderDialog(),
  });
  commandRegistry.register({
    id: 'file.revert',
    title: 'Revert File',
    category: 'File',
    run: revertActiveFile,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'file.closeEditor',
    title: 'Close Editor',
    category: 'File',
    run: closeActiveEditor,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'file.closeFolder',
    title: 'Close Folder',
    category: 'File',
    run: () => useWorkspaceStore.getState().closeWorkspace(),
  });
  commandRegistry.register({
    id: 'view.toggleSidebar',
    title: 'Toggle Sidebar',
    category: 'View',
    run: () => useLayoutStore.getState().togglePanel('sidebar'),
  });
  commandRegistry.register({
    id: 'view.toggleBottomPanel',
    title: 'Toggle Bottom Panel',
    category: 'View',
    run: () => useLayoutStore.getState().togglePanel('bottom'),
  });
  commandRegistry.register({
    id: 'view.toggleRightPanel',
    title: 'Toggle Assistant Panel',
    category: 'View',
    run: () => useLayoutStore.getState().togglePanel('right'),
  });
}
