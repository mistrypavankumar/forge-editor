import { useEditorStore } from '../stores/editor-store';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow } from './ProjectRow';

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i).replace(/^\//, '') : '';
}

export function RecentFilesView(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs);
  const setActive = useEditorStore((s) => s.setActive);

  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-faint">No recent files yet.</p>
      </div>
    );
  }

  // Most-recently opened first.
  const recent = [...tabs].reverse();

  return (
    <div className="h-full overflow-auto p-2">
      {recent.map((t) => (
        <ProjectRow
          key={t.path}
          icon={<ModernFileIcon name={t.name} />}
          name={t.name}
          meta={dirOf(t.path)}
          badge={t.dirty ? { label: 'modified', tone: 'changed' } : undefined}
          onClick={() => setActive(t.path)}
        />
      ))}
    </div>
  );
}
