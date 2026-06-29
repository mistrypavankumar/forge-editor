import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLayoutStore, type BottomTab } from '../stores/layout-store';
import { Tabs } from './ui/Tabs';
import { IconButton } from './ui/IconButton';
import { TerminalPanel } from './TerminalPanel';
import { ProblemList } from './ProblemList';
import { OutputPanel } from './OutputPanel';
import { TestPanel } from './TestPanel';
import { DebugConsolePanel } from './DebugConsolePanel';
import { useWorkbenchStatusStore, markerCounts } from '../stores/workbench-status-store';
import { cn } from '../lib/cn';

export function BottomPanel(): React.JSX.Element {
  const bottomTab = useLayoutStore((s) => s.bottomTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const counts = markerCounts(markers);

  // The terminal owns live shell (PTY) sessions, so once opened it must stay mounted —
  // unmounting it on a tab switch (or hiding the panel) would kill every session. Mount
  // lazily (no shell spawns until the terminal is first shown), then keep it alive and just
  // hide it when another tab is active or the panel is collapsed.
  const [terminalMounted, setTerminalMounted] = useState(false);
  useEffect(() => {
    if (bottomVisible && bottomTab === 'terminal') setTerminalMounted(true);
  }, [bottomVisible, bottomTab]);

  return (
    <div className="flex h-full flex-col border-t border-line bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-soft px-2">
        <Tabs
          size="sm"
          items={[
            { id: 'problems', label: 'Problems', badge: counts.errors + counts.warnings },
            { id: 'terminal', label: 'Terminal' },
            { id: 'output', label: 'Output' },
            { id: 'tests', label: 'Tests' },
            { id: 'debug', label: 'Debug Console' },
          ]}
          active={bottomTab}
          onSelect={(id) => setBottomTab(id as BottomTab)}
        />
        <IconButton label="Close panel" className="h-6 w-6" onClick={() => togglePanel('bottom')}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1">
        {bottomTab === 'problems' ? <ProblemList /> : null}
        {/* Kept mounted (hidden) once opened so shell sessions survive tab switches. */}
        {terminalMounted ? (
          <div className={cn('h-full', bottomTab !== 'terminal' && 'hidden')}>
            <TerminalPanel />
          </div>
        ) : null}
        {bottomTab === 'output' ? <OutputPanel /> : null}
        {bottomTab === 'tests' ? <TestPanel /> : null}
        {bottomTab === 'debug' ? <DebugConsolePanel /> : null}
      </div>
    </div>
  );
}
