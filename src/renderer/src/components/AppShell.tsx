import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';
import { useThemeStore } from '../stores/theme-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { applyCssVariables } from '../theme/theme-service';
import { builtInThemes } from '../theme/themes';
import { loadFiles } from '../lib/quickopen-cache';
import { detectPackageManager } from '../lib/detect-pm';
import { useTasksStore } from '../stores/tasks-store';
import { useKeybindings } from '../keybindings/use-keybindings';
import { useSettingsPersistence } from '../settings/use-settings-persistence';
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

  useEffect(() => {
    const theme = builtInThemes[themeId];
    if (theme) applyCssVariables(theme);
  }, [themeId]);

  // Warm the quick-open file list + resolve the git branch when a folder opens.
  useEffect(() => {
    if (!rootPath) return;
    void loadFiles(rootPath);
    void window.forge.gitBranch(rootPath).then((res) => {
      useWorkspaceStore.getState().setBranch(res.ok ? res.data : null);
    });
  }, [rootPath]);

  // Auto-detect the package manager from the project's lockfile.
  useEffect(() => {
    if (rootEntries.length > 0) {
      useTasksStore.getState().setPm(detectPackageManager(rootEntries.map((e) => e.name)));
    }
  }, [rootEntries]);

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
            <div className="min-h-0 flex-1">
              <CodeEditor />
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
