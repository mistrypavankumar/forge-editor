import { useEffect, useRef } from 'react';
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
import { RightPanel } from './RightPanel';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { Palette } from './Palette';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const themeId = useThemeStore((s) => s.currentId);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const promptedRef = useRef(false);

  useKeybindings();
  useSettingsPersistence();

  useEffect(() => {
    const theme = builtInThemes[themeId];
    if (theme) applyCssVariables(theme);
  }, [themeId]);

  // Warm the quick-open file list as soon as a folder opens.
  useEffect(() => {
    if (rootPath) void loadFiles(rootPath);
  }, [rootPath]);

  // On launch with no workspace, prompt to pick a folder (once). Cancelling
  // leaves the welcome screen.
  useEffect(() => {
    if (promptedRef.current || rootPath) return;
    promptedRef.current = true;
    void window.forge.openFolder().then((res) => {
      if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
    });
  }, [rootPath, setWorkspace]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <ActivitySidebar />
        <div className="min-w-0 flex-1">
          <Allotment proportionalLayout={false}>
            {sidebarVisible ? (
              <Allotment.Pane preferredSize={300} minSize={248} maxSize={460} snap>
                <div data-testid="sidebar-region" className="h-full border-r border-line bg-surface">
                  <ProjectNavigator />
                </div>
              </Allotment.Pane>
            ) : null}

            <Allotment.Pane minSize={420}>
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

            {rightVisible ? (
              <Allotment.Pane preferredSize={340} minSize={280} maxSize={520} snap>
                <RightPanel />
              </Allotment.Pane>
            ) : null}
          </Allotment>
        </div>
      </div>
      <StatusBar />
      <Palette />
    </div>
  );
}
