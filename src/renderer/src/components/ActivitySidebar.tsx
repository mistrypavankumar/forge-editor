import {
  Boxes,
  Search,
  GitBranch,
  Play,
  Blocks,
  Database,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useLayoutStore, type ActivityId } from '../stores/layout-store';
import { commandRegistry } from '../commands/command-registry';
import { cn } from '../lib/cn';

interface Item {
  id: ActivityId;
  label: string;
  Icon: LucideIcon;
  badge?: number;
}

const TOP: Item[] = [
  { id: 'explorer', label: 'Project', Icon: Boxes },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'git', label: 'Source Control', Icon: GitBranch, badge: 4 },
  { id: 'run', label: 'Run & Debug', Icon: Play },
  { id: 'database', label: 'Database / API', Icon: Database },
  { id: 'extensions', label: 'Extensions', Icon: Blocks },
];

export function ActivitySidebar(): React.JSX.Element {
  const activity = useLayoutStore((s) => s.activity);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const setActivity = useLayoutStore((s) => s.setActivity);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);

  const onSelect = (id: ActivityId): void => {
    if (id === activity) {
      togglePanel('sidebar');
      return;
    }
    setActivity(id);
    setPanelVisible('sidebar', true);
  };

  const renderItem = (item: Item): React.JSX.Element => {
    const isActive = item.id === activity && sidebarVisible;
    return (
      <button
        key={item.id}
        type="button"
        title={item.label}
        aria-label={item.label}
        onClick={() => onSelect(item.id)}
        className={cn(
          'relative flex h-11 w-full items-center justify-center text-faint transition-colors',
          'hover:text-fg',
          isActive && 'text-fg',
        )}
      >
        {isActive ? (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
        ) : null}
        <item.Icon size={20} strokeWidth={1.6} />
        {item.badge ? (
          <span className="absolute right-2.5 top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg">
            {item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <nav className="flex w-12 shrink-0 flex-col justify-between border-r border-line bg-bg py-1">
      <div className="flex flex-col">{TOP.map(renderItem)}</div>
      <div className="flex flex-col">
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => void commandRegistry.run('workbench.commandPalette')}
          className="flex h-11 w-full items-center justify-center text-faint transition-colors hover:text-fg"
        >
          <Settings size={20} strokeWidth={1.6} />
        </button>
      </div>
    </nav>
  );
}
