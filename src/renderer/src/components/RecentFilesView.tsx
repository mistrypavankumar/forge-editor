import { recentFiles, type RecentStatus } from '../data/recent';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow, type BadgeTone } from './ProjectRow';
import { openEntry } from '../lib/open-entry';

function statusBadge(status: RecentStatus): { label: string; tone: BadgeTone } | undefined {
  if (status === 'modified') return { label: 'modified', tone: 'changed' };
  if (status === 'issue') return { label: '1 issue', tone: 'issue' };
  return undefined;
}

export function RecentFilesView(): React.JSX.Element {
  return (
    <div className="overflow-auto p-2">
      {recentFiles.map((f) => (
        <ProjectRow
          key={f.id}
          icon={<ModernFileIcon name={f.name} />}
          name={f.name}
          meta={f.path}
          badge={statusBadge(f.status)}
          trailing={<span className="text-[11px] text-faint">{f.when}</span>}
          onClick={() => openEntry(f.name, f.path)}
        />
      ))}
    </div>
  );
}
