import { Files, Search, GitBranch, Settings, SquareTerminal, type LucideIcon } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';

interface ActivityItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

const TOP_ITEMS: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', Icon: Files },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'git', label: 'Source Control', Icon: GitBranch },
];

export function ActivityBar(): React.JSX.Element {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <div className="activitybar">
      <div className="activitybar-top">
        {TOP_ITEMS.map((item) => {
          const active = item.id === 'explorer' && sidebarVisible;
          return (
            <button
              key={item.id}
              type="button"
              className={`activitybar-item${active ? ' activitybar-item-active' : ''}`}
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (item.id === 'explorer') togglePanel('sidebar');
              }}
            >
              <item.Icon size={22} strokeWidth={1.6} />
            </button>
          );
        })}
      </div>
      <div className="activitybar-bottom">
        <button
          type="button"
          className="activitybar-item"
          title="API Explorer"
          aria-label="API Explorer"
          onClick={() => useLayoutStore.getState().setApiExplorerOpen(true)}
        >
          <SquareTerminal size={22} strokeWidth={1.6} />
        </button>
        <button type="button" className="activitybar-item" title="Settings" aria-label="Settings">
          <Settings size={22} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
