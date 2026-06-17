import { Target } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow } from './ProjectRow';

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i).replace(/^\//, '') : '';
}

export function FocusView(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const active = tabs.find((t) => t.path === activePath);
  const others = tabs.filter((t) => t.path !== activePath);

  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-faint">
          Open a file to focus your working set.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-2 pb-4">
      <div className="mx-2 mb-2 mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2">
        <Target size={14} className="text-accent" />
        <span className="text-[11px] text-faint">Focus</span>
        <span className="ml-1 truncate text-[13px] font-medium text-fg">
          {active?.name ?? 'Working set'}
        </span>
      </div>

      {active ? (
        <>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Active file
          </div>
          <ProjectRow
            icon={<ModernFileIcon name={active.name} />}
            name={active.name}
            meta={dirOf(active.path)}
            badge={active.dirty ? { label: 'modified', tone: 'changed' } : undefined}
            onClick={() => setActive(active.path)}
          />
        </>
      ) : null}

      {others.length > 0 ? (
        <>
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Also open
          </div>
          {others.map((t) => (
            <ProjectRow
              key={t.path}
              icon={<ModernFileIcon name={t.name} />}
              name={t.name}
              meta={dirOf(t.path)}
              badge={t.dirty ? { label: 'modified', tone: 'changed' } : undefined}
              onClick={() => setActive(t.path)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
