import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  projectMap,
  entryMatchesFilter,
  type BadgeKind,
  type MapEntry,
} from '../data/project-map';
import { useNavigatorStore } from '../stores/navigator-store';
import { ModernFolderIcon } from './ModernFolderIcon';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow, type BadgeTone } from './ProjectRow';
import { openEntry } from '../lib/open-entry';
import { cn } from '../lib/cn';

const BADGE_TONE: Record<BadgeKind, BadgeTone> = {
  changed: 'changed',
  issue: 'issue',
  clean: 'clean',
  count: 'count',
};

function entryBadge(entry: MapEntry): { label: string; tone: BadgeTone } | undefined {
  if (!entry.badge) return undefined;
  return { label: entry.badge.label, tone: BADGE_TONE[entry.badge.kind] };
}

export function ProjectMapView(): React.JSX.Element {
  const filter = useNavigatorStore((s) => s.filter);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(projectMap.filter((g) => g.collapsedByDefault).map((g) => [g.id, true])),
  );

  return (
    <div className="space-y-2.5 overflow-auto px-2.5 py-3">
      {projectMap.map((group) => {
        const entries = group.entries.filter((e) => entryMatchesFilter(e, filter));
        if (entries.length === 0) return null;
        const isCollapsed = collapsed[group.id];

        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-xl border border-line bg-surface/60"
          >
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
            >
              <ModernFolderIcon category={group.category} open={!isCollapsed} size={15} />
              <span className="text-[12px] font-semibold text-fg">{group.title}</span>
              <span className="truncate text-[11px] text-faint">· {group.description}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">
                  {entries.length}
                </span>
                <ChevronDown
                  size={14}
                  className={cn('text-faint transition-transform', isCollapsed && '-rotate-90')}
                />
              </span>
            </button>

            {!isCollapsed ? (
              <div className="border-t border-line-soft p-1.5">
                {entries.map((entry) => (
                  <ProjectRow
                    key={entry.id}
                    icon={
                      entry.isFolder ? (
                        <ModernFolderIcon category={group.category} />
                      ) : (
                        <ModernFileIcon name={entry.name} />
                      )
                    }
                    name={entry.name}
                    meta={entry.desc}
                    badge={entryBadge(entry)}
                    onClick={() => openEntry(entry.name, group.title)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
