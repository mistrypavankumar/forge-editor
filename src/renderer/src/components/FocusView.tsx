import { Target } from 'lucide-react';
import { focusGroups, focusTask, type FocusStatus } from '../data/focus';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow, type BadgeTone } from './ProjectRow';
import { openEntry } from '../lib/open-entry';

function statusBadge(status?: FocusStatus): { label: string; tone: BadgeTone } | undefined {
  if (status === 'modified') return { label: 'modified', tone: 'changed' };
  if (status === 'issue') return { label: '1 issue', tone: 'issue' };
  return undefined;
}

export function FocusView(): React.JSX.Element {
  return (
    <div className="overflow-auto px-2 pb-4">
      <div className="mx-2 mb-2 mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2">
        <Target size={14} className="text-accent" />
        <span className="text-[11px] text-faint">Focus</span>
        <span className="ml-1 truncate text-[13px] font-medium text-fg">{focusTask}</span>
      </div>

      {focusGroups.map((group) => (
        <div key={group.title} className="mt-2">
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
            {group.title}
          </div>
          {group.files.map((file) => (
            <ProjectRow
              key={file.id}
              icon={<ModernFileIcon name={file.name} />}
              name={file.name}
              meta={`${file.path} · ${file.role}`}
              badge={statusBadge(file.status)}
              onClick={() => openEntry(file.name, file.path)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
