import { CircleX, TriangleAlert, Info } from 'lucide-react';
import { problems, type Severity } from '../data/problems';

function SeverityIcon({ severity }: { severity: Severity }): React.JSX.Element {
  if (severity === 'error') return <CircleX size={14} className="text-danger" />;
  if (severity === 'warning') return <TriangleAlert size={14} className="text-warning" />;
  return <Info size={14} className="text-info" />;
}

export function ProblemList(): React.JSX.Element {
  return (
    <div className="h-full overflow-auto py-1">
      {problems.map((p) => (
        <div
          key={p.id}
          className="flex items-start gap-2.5 px-3 py-1.5 hover:bg-surface-3"
        >
          <span className="mt-0.5 shrink-0">
            <SeverityIcon severity={p.severity} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-muted">{p.message}</p>
            <p className="mt-0.5 text-[11px] text-faint">
              {p.fileLabel}:{p.line}:{p.col}
              <span className="ml-2 font-mono">{p.code}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
