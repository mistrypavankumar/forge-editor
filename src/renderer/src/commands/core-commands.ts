import { commandRegistry } from './command-registry';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFolderDialog, openFileDialog } from '../lib/workspace-actions';
import { newFile } from '../lib/fs-actions';
import { formatActiveFile, maybeFormatOnSave } from '../lib/format-actions';
import { saveAllFiles } from '../lib/save-actions';
import { getActiveEditor } from '../editor/active-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useDiagnosticsStore } from '../stores/diagnostics-store';

let untitledSeq = 0;

function isUntitled(path: string): boolean {
  return !path.startsWith('/');
}

export async function saveActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab || tab.readOnly) return;
  if (isUntitled(tab.path)) {
    const res = await window.forge.saveDialog(tab.name);
    if (!res.ok || !res.data) return;
    const path = res.data;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const w = await window.forge.writeFile(path, tab.content);
    if (w.ok) {
      state.renameTab(tab.path, path, name);
      await maybeFormatOnSave(path);
    }
    return;
  }
  const res = await window.forge.writeFile(tab.path, tab.content);
  if (res.ok) {
    state.markSaved(tab.path);
    await maybeFormatOnSave(tab.path);
  }
}

export function newTextFile(): void {
  untitledSeq += 1;
  const name = `Untitled-${untitledSeq}`;
  useEditorStore.getState().openFile({ path: name, name, content: '' });
}

export async function revertActiveFile(): Promise<void> {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.path === state.activePath);
  if (!tab || tab.readOnly || isUntitled(tab.path)) return;
  const res = await window.forge.readFile(tab.path);
  if (res.ok) state.requestRevert(tab.path, res.data);
}

function closeActiveEditor(): void {
  const state = useEditorStore.getState();
  if (state.activePath) state.closeFile(state.activePath);
}

async function reopenClosedEditor(): Promise<void> {
  const path = useEditorStore.getState().takeClosed();
  if (!path) return;
  const res = await window.forge.readFile(path);
  if (res.ok) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    useEditorStore.getState().openFile({ path, name, content: res.data });
  }
}

function gotoLine(): void {
  const editor = getActiveEditor();
  if (!editor) return;
  editor.focus();
  void editor.getAction('editor.action.gotoLine')?.run();
}

function toggleWordWrap(): void {
  const editor = getActiveEditor();
  if (!editor) return;
  const current = editor.getOption(getMonaco().editor.EditorOption.wordWrap);
  editor.updateOptions({ wordWrap: current === 'on' ? 'off' : 'on' });
}

function toggleMinimap(): void {
  const editor = getActiveEditor();
  if (!editor) return;
  const current = editor.getOption(getMonaco().editor.EditorOption.minimap);
  editor.updateOptions({ minimap: { enabled: !current.enabled } });
}

function toggleTerminal(): void {
  const l = useLayoutStore.getState();
  if (l.bottomVisible && l.bottomTab === 'terminal') {
    l.setPanelVisible('bottom', false);
    return;
  }
  l.setBottomTab('terminal');
  l.setPanelVisible('bottom', true);
}

function findInFiles(): void {
  const l = useLayoutStore.getState();
  l.setActivity('search');
  l.setPanelVisible('sidebar', true);
}

function checkProblems(): void {
  const l = useLayoutStore.getState();
  l.setBottomTab('problems');
  l.setPanelVisible('bottom', true);
  void useDiagnosticsStore.getState().run();
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
    id: 'editor.formatDocument',
    title: 'Format Document',
    category: 'Editor',
    run: formatActiveFile,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'file.saveAll',
    title: 'Save All',
    category: 'File',
    run: saveAllFiles,
    isEnabled: () => useEditorStore.getState().tabs.some((t) => t.dirty),
  });
  commandRegistry.register({
    id: 'file.closeAllEditors',
    title: 'Close All Editors',
    category: 'File',
    run: () => useEditorStore.getState().closeAll(),
    isEnabled: () => useEditorStore.getState().tabs.length > 0,
  });
  commandRegistry.register({
    id: 'file.reopenClosedEditor',
    title: 'Reopen Closed Editor',
    category: 'File',
    run: reopenClosedEditor,
    isEnabled: () => useEditorStore.getState().closedStack.length > 0,
  });
  commandRegistry.register({
    id: 'editor.splitRight',
    title: 'Split Editor Right',
    category: 'Editor',
    run: () => useEditorStore.getState().splitRight(),
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'editor.nextTab',
    title: 'Next Editor Tab',
    category: 'Editor',
    run: () => useEditorStore.getState().cycleTab(1),
    isEnabled: () => useEditorStore.getState().tabs.length > 1,
  });
  commandRegistry.register({
    id: 'editor.prevTab',
    title: 'Previous Editor Tab',
    category: 'Editor',
    run: () => useEditorStore.getState().cycleTab(-1),
    isEnabled: () => useEditorStore.getState().tabs.length > 1,
  });
  commandRegistry.register({
    id: 'editor.gotoLine',
    title: 'Go to Line/Column…',
    category: 'Go',
    run: gotoLine,
    isEnabled: () => useEditorStore.getState().activePath !== null,
  });
  commandRegistry.register({
    id: 'editor.toggleWordWrap',
    title: 'Toggle Word Wrap',
    category: 'View',
    run: toggleWordWrap,
  });
  commandRegistry.register({
    id: 'editor.toggleMinimap',
    title: 'Toggle Minimap',
    category: 'View',
    run: toggleMinimap,
  });
  commandRegistry.register({
    id: 'view.toggleTerminal',
    title: 'Toggle Terminal',
    category: 'View',
    run: toggleTerminal,
  });
  commandRegistry.register({
    id: 'workbench.findInFiles',
    title: 'Find in Files',
    category: 'Search',
    run: findInFiles,
  });
  commandRegistry.register({
    id: 'workbench.openSettings',
    title: 'Open Settings',
    category: 'Preferences',
    run: () => useLayoutStore.getState().setSettingsOpen(true),
  });
  commandRegistry.register({
    id: 'workbench.checkProblems',
    title: 'Check Problems (project-wide)',
    category: 'View',
    run: checkProblems,
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
