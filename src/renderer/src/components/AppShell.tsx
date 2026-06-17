import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';
import { useThemeStore } from '../stores/theme-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { applyCssVariables } from '../theme/theme-service';
import { builtInThemes } from '../theme/themes';
import { loadFiles } from '../lib/quickopen-cache';
import { useKeybindings } from '../keybindings/use-keybindings';
import { useSettingsPersistence } from '../settings/use-settings-persistence';
import { TopBar } from './TopBar';
import { ActivitySidebar } from './ActivitySidebar';
import { ProjectNavigator } from './ProjectNavigator';
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
  const sidebarSide = useLayoutStore((s) => s.sidebarSide);
  const setSidebarSide = useLayoutStore((s) => s.setSidebarSide);
  const themeId = useThemeStore((s) => s.currentId);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
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

  const navigatorPane = sidebarVisible ? (
    <Allotment.Pane key="nav" preferredSize={300} minSize={248} maxSize={460} snap>
      <div
        data-testid="sidebar-region"
        onContextMenu={onSidebarContextMenu}
        className="h-full border-x border-line bg-surface"
      >
        <ProjectNavigator />
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

  const panes =
    sidebarSide === 'left'
      ? [navigatorPane, centerPane, assistantPane]
      : [assistantPane, centerPane, navigatorPane];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {sidebarSide === 'left' ? <ActivitySidebar onContextMenu={onSidebarContextMenu} /> : null}
        <div className="min-w-0 flex-1">
          <Allotment proportionalLayout={false}>{panes}</Allotment>
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
