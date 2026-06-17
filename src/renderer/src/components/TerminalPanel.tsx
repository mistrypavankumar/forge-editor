import { Play } from 'lucide-react';
import { terminalHistory, quickTasks, type TerminalLineKind } from '../data/terminal';
import { cn } from '../lib/cn';

const LINE_STYLE: Record<TerminalLineKind, string> = {
  cmd: 'text-fg',
  out: 'text-muted',
  ok: 'text-success',
  err: 'text-danger',
  muted: 'text-faint',
};

export function TerminalPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line-soft px-3 py-1.5">
        <span className="mr-1 text-[11px] text-faint">Tasks</span>
        {quickTasks.map((t) => (
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
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5">
        {terminalHistory.map((line) => (
          <div key={line.id} className={cn('whitespace-pre-wrap', LINE_STYLE[line.kind])}>
            {line.kind === 'cmd' ? <span className="mr-1.5 text-accent">❯</span> : null}
            {line.text}
          </div>
        ))}
        <div className="flex items-center text-fg">
          <span className="mr-1.5 text-accent">❯</span>
          <span className="h-3.5 w-1.5 animate-pulse bg-fg/70" />
        </div>
      </div>
    </div>
  );
}
