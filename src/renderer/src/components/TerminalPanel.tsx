import { Play } from 'lucide-react';

const QUICK_TASKS = [
  { id: 'dev', label: 'Dev', command: 'npm run dev' },
  { id: 'test', label: 'Test', command: 'npm run test' },
  { id: 'build', label: 'Build', command: 'npm run build' },
  { id: 'lint', label: 'Lint', command: 'npm run lint' },
];

export function TerminalPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft px-3 py-1.5">
        <span className="mr-1 text-[11px] text-faint">Tasks</span>
        {QUICK_TASKS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.command}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            <Play size={10} className="fill-current text-accent" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5 text-faint">
        <div className="flex items-center text-fg">
          <span className="mr-1.5 text-accent">❯</span>
          <span className="h-3.5 w-1.5 animate-pulse bg-fg/70" />
        </div>
      </div>
    </div>
  );
}
