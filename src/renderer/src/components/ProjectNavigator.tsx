import { useNavigatorStore } from '../stores/navigator-store';
import { filterChips } from '../data/project-map';
import { NavigatorTabs } from './NavigatorTabs';
import { FocusView } from './FocusView';
import { ProjectMapView } from './ProjectMapView';
import { RecentFilesView } from './RecentFilesView';
import { StructureTreeView } from './StructureTreeView';
import { cn } from '../lib/cn';

export function ProjectNavigator(): React.JSX.Element {
  const tab = useNavigatorStore((s) => s.tab);
  const filter = useNavigatorStore((s) => s.filter);
  const setFilter = useNavigatorStore((s) => s.setFilter);

  const showChips = tab === 'map';

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line-soft pb-2">
        <NavigatorTabs />
        {showChips ? (
          <div className="flex flex-wrap gap-1 px-2 pt-2">
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  filter === chip.id
                    ? 'bg-accent/15 text-accent'
                    : 'bg-surface-2 text-faint hover:text-muted',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'focus' ? <FocusView /> : null}
        {tab === 'map' ? <ProjectMapView /> : null}
        {tab === 'recent' ? <RecentFilesView /> : null}
        {tab === 'structure' ? <StructureTreeView /> : null}
      </div>
    </div>
  );
}
