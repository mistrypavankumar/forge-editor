import { useLayoutStore } from '../stores/layout-store';
import { Tabs } from './ui/Tabs';
import { AssistantPanel } from './AssistantPanel';
import { ContextPanel } from './ContextPanel';
import { ChangesPanel } from './ChangesPanel';
import { fileChanges } from '../data/changes';

export function RightPanel(): React.JSX.Element {
  const rightTab = useLayoutStore((s) => s.rightTab);
  const setRightTab = useLayoutStore((s) => s.setRightTab);

  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface">
      <div className="flex h-9 shrink-0 items-center border-b border-line px-2">
        <Tabs
          items={[
            { id: 'assistant', label: 'Assistant' },
            { id: 'context', label: 'Context' },
            { id: 'changes', label: 'Changes', badge: fileChanges.length },
          ]}
          active={rightTab}
          onSelect={(id) => setRightTab(id as typeof rightTab)}
        />
      </div>
      <div className="min-h-0 flex-1">
        {rightTab === 'assistant' ? <AssistantPanel /> : null}
        {rightTab === 'context' ? <ContextPanel /> : null}
        {rightTab === 'changes' ? <ChangesPanel /> : null}
      </div>
    </aside>
  );
}
