import { outputLines, type TerminalLineKind } from '../data/terminal';
import { cn } from '../lib/cn';

const STYLE: Record<TerminalLineKind, string> = {
  cmd: 'text-fg',
  out: 'text-muted',
  ok: 'text-success',
  err: 'text-danger',
  muted: 'text-faint',
};

interface OutputPanelProps {
  empty?: string;
}

export function OutputPanel({ empty }: OutputPanelProps): React.JSX.Element {
  if (empty) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-faint">{empty}</div>
    );
  }
  return (
    <div className="h-full overflow-auto px-3 py-2 font-mono text-[12px] leading-5">
      {outputLines.map((line) => (
        <div key={line.id} className={cn(STYLE[line.kind])}>
          {line.text}
        </div>
      ))}
    </div>
  );
}
