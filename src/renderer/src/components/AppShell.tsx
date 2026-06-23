import { useEffect, useRef, useState } from 'react';
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
import { useTerminalStore } from '../stores/terminal-store';
import { useJavaStatusStore } from '../stores/java-status-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { useKeybindings } from '../keybindings/use-keybindings';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { useSettingsPersistence } from '../settings/use-settings-persistence';
import { useAutoSave } from '../settings/use-auto-save';
import { useAutoFormat } from '../settings/use-auto-format';
import { useAutoDiagnostics } from '../settings/use-auto-diagnostics';
import { commandRegistry } from '../commands/command-registry';
import { TopBar } from './TopBar';
import { ActivitySidebar } from './ActivitySidebar';
import { ProjectNavigator } from './ProjectNavigator';
import { SearchPanel } from './SearchPanel';
import { SourceControlPanel } from './SourceControlPanel';
import { RunPanel } from './RunPanel';
import { PlaceholderPanel } from './PlaceholderPanel';
import { Database, Blocks } from 'lucide-react';
import { EditorGroupView } from './EditorGroupView';
import { Landing } from './Landing';
import { useEditorStore } from '../stores/editor-store';
import { RightPanel } from './RightPanel';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { Palette } from './Palette';
import { AwsConnectionPicker } from './AwsConnectionPicker';
import { AwsCredentialsEditor } from './AwsCredentialsEditor';
import { useAwsStore } from '../stores/aws-store';
import { GitUserPicker } from './GitUserPicker';
import { useGitUserStore } from '../stores/git-user-store';
import { SettingsView } from './SettingsView';
import { FeaturesView } from './FeaturesView';
import { ContextMenu } from './ui/ContextMenu';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const activity = useLayoutStore((s) => s.activity);
  const sidebarSide = useLayoutStore((s) => s.sidebarSide);
  const setSidebarSide = useLayoutStore((s) => s.setSidebarSide);
  const themeId = useThemeStore((s) => s.currentId);
  const glass = useThemeStore((s) => s.glass);
  const glassOpacity = useThemeStore((s) => s.glassOpacity);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const tabCount = useEditorStore((s) => s.tabs.length);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Restore the active AWS connection (and profile list) for the status-bar indicator.
  useEffect(() => {
    void useAwsStore.getState().load();
  }, []);

  // Reflect the open repo's git identity in the status bar (re-reads when the folder changes).
  useEffect(() => {
    if (rootPath) void useGitUserStore.getState().loadActive(rootPath);
  }, [rootPath]);

  // Name the window after the open folder so the dock/window menu lists folders, not "Forge".
  // Electron derives each window's title from the page's document.title.
  useEffect(() => {
    const folder = rootPath ? (rootPath.split('/').filter(Boolean).pop() ?? rootPath) : null;
    document.title = folder ?? 'Forge';
  }, [rootPath]);

  const onSidebarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const keybindingOverrides = useKeybindingsStore((s) => s.overrides);
  useKeybindings(keybindingOverrides);
  useSettingsPersistence();
  useAutoSave();
  useAutoFormat();
  useAutoDiagnostics();

  const autoSave = useEditorStore((s) => s.autoSave);
  const editorGroups = useEditorStore((s) => s.groups);

  // When a task terminal's command returns to the shell (done/failed/interrupted), drop its
  // running indicator. The first event a task session gets is "busy"; the next "idle" clears it.
  // Also surface the live foreground-process name on the tab (vim, node, claude…), reverting
  // to the base label when idle.
  useEffect(() => {
    return window.forge.onTerminalBusy(({ id, busy, proc }) => {
      const store = useTerminalStore.getState();
      if (!busy) store.clearTask(id);
      store.setProc(id, busy ? proc : undefined);
    });
  }, []);

  // Mirror the jdtls (Java language server) lifecycle for the status-bar indicator.
  useEffect(() => {
    void window.forge.getJavaStatus().then((s) => useJavaStatusStore.getState().setStatus(s));
    return window.forge.onJavaStatus((s) => useJavaStatusStore.getState().setStatus(s));
  }, []);

  // Navigator follows the editor: jump to Changes when the first file opens, back to Structure when
  // the last one closes. Only on that transition, so manual tab choices in between are respected.
  const hadFiles = useRef(tabCount > 0);
  useEffect(() => {
    const hasFiles = tabCount > 0;
    if (hasFiles && !hadFiles.current) useNavigatorStore.getState().setTab('changes');
    else if (!hasFiles && hadFiles.current) useNavigatorStore.getState().setTab('structure');
    hadFiles.current = hasFiles;
  }, [tabCount]);

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

  // Drive the frosted-glass translucency. Transparency off → fully opaque surfaces.
  // Glass is a dark-theme effect: pale light surfaces over a bright blurred desktop wash
  // out text and syntax colors, so light themes always render fully opaque (crisp, pure
  // white) regardless of the slider.
  useEffect(() => {
    const isLight = builtInThemes[themeId]?.type === 'light';
    const effective = !glass || isLight ? 1 : Math.max(glassOpacity, 0.1);
    document.documentElement.style.setProperty('--glass-opacity', String(effective));
  }, [glass, glassOpacity, themeId]);

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
        <AwsConnectionPicker />
        <AwsCredentialsEditor />
        <GitUserPicker />
        <SettingsView />
        <FeaturesView />
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
          {editorGroups.length > 1 ? (
            <Allotment proportionalLayout>
              {editorGroups.map((g) => (
                <Allotment.Pane key={g.id} minSize={320}>
                  <EditorGroupView groupId={g.id} />
                </Allotment.Pane>
              ))}
            </Allotment>
          ) : (
            <EditorGroupView groupId={editorGroups[0]?.id ?? 'main'} />
          )}
        </Allotment.Pane>
        {/* Always mounted; we toggle visibility (not mount) so live terminal PTY
            sessions survive hiding/restoring the bottom panel. Unmounting it would
            tear down every TerminalView and kill its shell. */}
        <Allotment.Pane preferredSize={240} minSize={120} snap visible={bottomVisible}>
          <BottomPanel />
        </Allotment.Pane>
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
      <AwsConnectionPicker />
      <AwsCredentialsEditor />
      <GitUserPicker />
      <SettingsView />
      <FeaturesView />
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
