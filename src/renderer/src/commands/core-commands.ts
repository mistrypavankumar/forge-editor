import { commandRegistry } from './command-registry';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';

export async function saveActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab) return;
  const res = await window.forge.writeFile(tab.path, tab.content);
  if (res.ok) state.markSaved(tab.path);
}

async function openFolder(): Promise<void> {
  const res = await window.forge.openFolder();
  if (res.ok && res.data) {
    useWorkspaceStore.getState().setWorkspace(res.data.rootPath, res.data.tree);
  }
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
    id: 'file.openFolder',
    title: 'Open Folder…',
    category: 'File',
    run: openFolder,
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
