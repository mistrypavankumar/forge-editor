import { CircleX, TriangleAlert, Info, CircleCheck } from 'lucide-react';
import { useWorkbenchStatusStore, type MarkerSeverity } from '../stores/workbench-status-store';
import { useEditorStore } from '../stores/editor-store';
import { EmptyState } from './ui/EmptyState';

function SeverityIcon({ severity }: { severity: MarkerSeverity }): React.JSX.Element {
  if (severity === 'error') return <CircleX size={14} className="text-danger" />;
  if (severity === 'warning') return <TriangleAlert size={14} className="text-warning" />;
  return <Info size={14} className="text-info" />;
}

export function ProblemList(): React.JSX.Element {
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const setActive = useEditorStore((s) => s.setActive);
  const tabs = useEditorStore((s) => s.tabs);

  if (markers.length === 0) {
    return <EmptyState icon={CircleCheck} title="No problems detected" hint="Diagnostics from open files appear here." />;
  }

  return (
    <div className="h-full overflow-auto py-1">
      {markers.map((m) => {
        const tab = tabs.find((t) => t.path === m.path);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => tab && setActive(tab.path)}
            className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2"
          >
            <span className="mt-0.5 shrink-0">
              <SeverityIcon severity={m.severity} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-muted">{m.message}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {m.file}:{m.line}:{m.col}
                {m.code ? <span className="ml-2 font-mono">{m.code}</span> : null}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
