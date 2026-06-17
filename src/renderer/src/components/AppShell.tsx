import { useEffect, useState } from 'react';
import { Allotment } from 'allotment';
import { useLayoutStore } from '../stores/layout-store';

export function AppShell(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const [pong, setPong] = useState('');

  useEffect(() => {
    void window.forge.ping('ready').then(setPong);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Allotment>
          {sidebarVisible && (
            <Allotment.Pane preferredSize={240} minSize={160}>
              <div className="region" data-testid="sidebar-region">
                Explorer
              </div>
            </Allotment.Pane>
          )}
          <Allotment.Pane>
            <div className="region" data-testid="editor-region">
              Editor
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
      <div className="statusbar" data-testid="statusbar-region">
        Forge — {pong || 'connecting…'}
      </div>
    </div>
  );
}
