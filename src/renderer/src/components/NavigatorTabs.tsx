import { useNavigatorStore, type NavigatorTab } from '../stores/navigator-store';
import { cn } from '../lib/cn';

const TABS: { id: NavigatorTab; label: string }[] = [
  { id: 'changes', label: 'Changes' },
  { id: 'map', label: 'Map' },
  { id: 'recent', label: 'Recent' },
  { id: 'structure', label: 'Structure' },
];

export function NavigatorTabs(): React.JSX.Element {
  const tab = useNavigatorStore((s) => s.tab);
  const setTab = useNavigatorStore((s) => s.setTab);

  return (
    <div className="flex items-center gap-1 px-2 pt-2">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tab === t.id ? 'bg-surface-3 text-fg' : 'text-faint hover:text-muted',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
