import { GitBranch } from 'lucide-react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';
import { useEditorStore } from '../stores/editor-store';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { FileExplorer } from './FileExplorer';
import { EditorPane } from './EditorPane';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <ActivityBar />
        <div className="app-main">
          <Allotment proportionalLayout={false}>
            {sidebarVisible && (
              <Allotment.Pane preferredSize={260} minSize={180}>
                <div className="sidebar" data-testid="sidebar-region">
                  <FileExplorer />
                </div>
              </Allotment.Pane>
            )}
            <Allotment.Pane>
              <div className="editor-region" data-testid="editor-region">
                <EditorPane />
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>
      <div className="statusbar" data-testid="statusbar-region">
        <div className="statusbar-left">
          <span className="statusbar-item statusbar-branch">
            <GitBranch size={13} strokeWidth={1.75} />
            main
          </span>
        </div>
        <div className="statusbar-right">
          {active && <span className="statusbar-item">{active.dirty ? 'Unsaved' : 'Saved'}</span>}
          <span className="statusbar-item">Forge</span>
        </div>
      </div>
    </div>
  );
}
