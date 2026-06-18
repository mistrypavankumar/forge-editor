import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';
import { useThemeStore } from '../stores/theme-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { applyCssVariables } from '../theme/theme-service';
import { builtInThemes } from '../theme/themes';
import { loadFiles } from '../lib/quickopen-cache';
import { refreshTree } from '../lib/fs-actions';
import { detectPackageManager } from '../lib/detect-pm';
import { detectFormatters } from '../lib/detect-formatters';
import { useFormatterStore } from '../stores/formatter-store';
import { useTasksStore } from '../stores/tasks-store';
import { useKeybindings } from '../keybindings/use-keybindings';
import { useSettingsPersistence } from '../settings/use-settings-persistence';
import { useAutoSave } from '../settings/use-auto-save';
import { useAutoFormat } from '../settings/use-auto-format';
import { commandRegistry } from '../commands/command-registry';
import { TopBar } from './TopBar';
import { ActivitySidebar } from './ActivitySidebar';
import { ProjectNavigator } from './ProjectNavigator';
import { SearchPanel } from './SearchPanel';
import { SourceControlPanel } from './SourceControlPanel';
import { RunPanel } from './RunPanel';
import { PlaceholderPanel } from './PlaceholderPanel';
import { Database, Blocks } from 'lucide-react';
import { EditorTabs } from './EditorTabs';
import { Breadcrumbs } from './Breadcrumbs';
import { CodeEditor } from './CodeEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffView } from './DiffView';
import { Landing } from './Landing';
import { useEditorStore } from '../stores/editor-store';
import { RightPanel } from './RightPanel';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { Palette } from './Palette';
import { ContextMenu } from './ui/ContextMenu';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const activity = useLayoutStore((s) => s.activity);
  const sidebarSide = useLayoutStore((s) => s.sidebarSide);
  const setSidebarSide = useLayoutStore((s) => s.setSidebarSide);
  const themeId = useThemeStore((s) => s.currentId);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const tabCount = useEditorStore((s) => s.tabs.length);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onSidebarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  useKeybindings();
  useSettingsPersistence();
  useAutoSave();
  useAutoFormat();

  const autoSave = useEditorStore((s) => s.autoSave);
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const activeTab = tabs.find((t) => t.path === activePath);
  const showDiff = !!activeTab && activeTab.original !== undefined;
  const showPreview =
    mdPreview && !showDiff && !!activeTab && /\.mdx?$/i.test(activeTab.name);

  // Native (mac) File-menu actions → run the matching command.
  useEffect(() => {
    return window.forge.onMenuAction((id) => {
      if (id === 'toggleAutoSave') {
        useEditorStore.getState().setAutoSave(!useEditorStore.getState().autoSave);
      } else {
        void commandRegistry.run(id);
      }
    });
  }, []);

  // Keep the native Auto Save checkbox in sync.
  useEffect(() => {
    window.forge.syncMenuState(autoSave);
  }, [autoSave]);

  useEffect(() => {
    const theme = builtInThemes[themeId];
    if (theme) applyCssVariables(theme);
  }, [themeId]);

  const syncTick = useWorkspaceStore((s) => s.syncTick);

  // Warm the quick-open file list + resolve the git branch when a folder opens.
  useEffect(() => {
    if (!rootPath) return;
    void loadFiles(rootPath);
    void window.forge.gitBranch(rootPath).then((res) => {
      useWorkspaceStore.getState().setBranch(res.ok ? res.data : null);
    });
  }, [rootPath]);

  // Keep the source-control change count (activity-bar badge) in sync.
  useEffect(() => {
    if (!rootPath) {
      useWorkspaceStore.getState().setChangeCount(0);
      return;
    }
    void window.forge.gitChangedFiles(rootPath).then((res) => {
      useWorkspaceStore.getState().setChangeCount(res.ok ? res.data.length : 0);
    });
  }, [rootPath, syncTick]);

  // Auto-detect the package manager from the project's lockfile.
  useEffect(() => {
    if (rootEntries.length > 0) {
      useTasksStore.getState().setPm(detectPackageManager(rootEntries.map((e) => e.name)));
    }
  }, [rootEntries]);

  // Detect available document formatters (ESLint plus any configured at the repo root).
  useEffect(() => {
    useFormatterStore.getState().setAvailable(detectFormatters(rootEntries.map((e) => e.name)));
  }, [rootEntries]);

  // Watch the workspace and auto-sync the tree, git status, and branch on external changes.
  useEffect(() => {
    if (!rootPath) return;
    window.forge.watchWorkspace(rootPath);
    const off = window.forge.onFsChanged(() => {
      void refreshTree();
      void window.forge.gitBranch(rootPath).then((r) => {
        useWorkspaceStore.getState().setBranch(r.ok ? r.data : null);
      });
      useWorkspaceStore.getState().bumpSync();
    });
    return off;
  }, [rootPath]);

  const showLanding = !rootPath && tabCount === 0;

  if (showLanding) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
        <TopBar />
        <Landing />
        <StatusBar />
        <Palette />
      </div>
    );
  }

  const sidePanel =
    activity === 'search' ? (
      <SearchPanel />
    ) : activity === 'git' ? (
      <SourceControlPanel />
    ) : activity === 'run' ? (
      <RunPanel />
    ) : activity === 'database' ? (
      <PlaceholderPanel
        title="Database / API"
        icon={Database}
        hint="Connect a database or API to browse it here."
      />
    ) : activity === 'extensions' ? (
      <PlaceholderPanel title="Extensions" icon={Blocks} hint="A plugin system is on the roadmap." />
    ) : (
      <ProjectNavigator />
    );

  const navigatorPane = sidebarVisible ? (
    <Allotment.Pane key="nav" preferredSize={300} minSize={248} maxSize={460} snap>
      <div data-testid="sidebar-region" className="h-full border-x border-line bg-surface">
        {sidePanel}
      </div>
    </Allotment.Pane>
  ) : null;

  const centerPane = (
    <Allotment.Pane key="center" minSize={420}>
      <Allotment vertical proportionalLayout={false}>
        <Allotment.Pane minSize={160}>
          <div data-testid="editor-region" className="flex h-full flex-col bg-bg">
            <EditorTabs />
            <Breadcrumbs />
            <div className="relative min-h-0 flex-1">
              <CodeEditor />
              {showPreview && activeTab ? <MarkdownPreview content={activeTab.content} /> : null}
              {showDiff && activeTab ? (
                <DiffView
                  original={activeTab.original ?? ''}
                  modified={activeTab.content}
                  name={activeTab.name}
                />
              ) : null}
            </div>
          </div>
        </Allotment.Pane>
        {bottomVisible ? (
          <Allotment.Pane preferredSize={240} minSize={120} snap>
            <BottomPanel />
          </Allotment.Pane>
        ) : null}
      </Allotment>
    </Allotment.Pane>
  );

  const assistantPane = rightVisible ? (
    <Allotment.Pane key="assistant" preferredSize={340} minSize={280} maxSize={520} snap>
      <RightPanel />
    </Allotment.Pane>
  ) : null;

  const panes = (
    sidebarSide === 'left'
      ? [navigatorPane, centerPane, assistantPane]
      : [assistantPane, centerPane, navigatorPane]
  ).filter(Boolean);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {sidebarSide === 'left' ? <ActivitySidebar onContextMenu={onSidebarContextMenu} /> : null}
        <div className="min-w-0 flex-1">
          <Allotment key={sidebarSide} proportionalLayout={false}>
            {panes}
          </Allotment>
        </div>
        {sidebarSide === 'right' ? <ActivitySidebar onContextMenu={onSidebarContextMenu} /> : null}
      </div>
      <StatusBar />
      <Palette />
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Move Primary Side Bar Left',
              checked: sidebarSide === 'left',
              onSelect: () => setSidebarSide('left'),
            },
            {
              label: 'Move Primary Side Bar Right',
              checked: sidebarSide === 'right',
              onSelect: () => setSidebarSide('right'),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
