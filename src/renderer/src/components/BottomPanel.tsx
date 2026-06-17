import { X } from 'lucide-react';
import { useLayoutStore, type BottomTab } from '../stores/layout-store';
import { Tabs } from './ui/Tabs';
import { IconButton } from './ui/IconButton';
import { TerminalPanel } from './TerminalPanel';
import { ProblemList } from './ProblemList';
import { OutputPanel } from './OutputPanel';
import { TestPanel } from './TestPanel';
import { problemCounts } from '../data/problems';
import { testSummary } from '../data/tests';

export function BottomPanel(): React.JSX.Element {
  const bottomTab = useLayoutStore((s) => s.bottomTab);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const counts = problemCounts();

  return (
    <div className="flex h-full flex-col border-t border-line bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-soft px-2">
        <Tabs
          size="sm"
          items={[
            { id: 'problems', label: 'Problems', badge: counts.errors + counts.warnings },
            { id: 'terminal', label: 'Terminal' },
            { id: 'output', label: 'Output' },
            { id: 'tests', label: 'Tests', badge: testSummary.failed },
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
        {bottomTab === 'terminal' ? <TerminalPanel /> : null}
        {bottomTab === 'output' ? <OutputPanel /> : null}
        {bottomTab === 'tests' ? <TestPanel /> : null}
        {bottomTab === 'debug' ? (
          <OutputPanel empty="No active debug session. Press F5 to start debugging." />
        ) : null}
      </div>
    </div>
  );
}
