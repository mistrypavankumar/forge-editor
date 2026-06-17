import { CheckCircle2, XCircle, MinusCircle, Play } from 'lucide-react';
import { testResults, testSummary, type TestStatus } from '../data/tests';

function StatusIcon({ status }: { status: TestStatus }): React.JSX.Element {
  if (status === 'pass') return <CheckCircle2 size={14} className="text-success" />;
  if (status === 'fail') return <XCircle size={14} className="text-danger" />;
  return <MinusCircle size={14} className="text-faint" />;
}

export function TestPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-3 py-1.5 text-[11px]">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-muted hover:text-fg"
        >
          <Play size={10} className="fill-current text-accent" /> Run all
        </button>
        <span className="text-success">{testSummary.passed} passed</span>
        <span className="text-danger">{testSummary.failed} failed</span>
        <span className="text-faint">{testSummary.skipped} skipped</span>
        <span className="ml-auto text-faint">{testSummary.durationMs}ms</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {testResults.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 px-3 py-1 hover:bg-surface-3">
            <StatusIcon status={t.status} />
            <span className="truncate text-[13px] text-muted">{t.name}</span>
            <span className="ml-auto shrink-0 text-[11px] text-faint">
              {t.status === 'skip' ? '—' : `${t.durationMs}ms`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
