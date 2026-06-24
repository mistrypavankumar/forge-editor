import { cn } from '../lib/cn';

export type BadgeTone = 'changed' | 'issue' | 'clean' | 'count' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  changed: 'text-info bg-info/10',
  issue: 'text-danger bg-danger/10',
  clean: 'text-faint bg-surface-3',
  count: 'text-muted bg-surface-3',
  neutral: 'text-muted bg-surface-3',
};

interface ProjectRowProps {
  icon: React.ReactNode;
  name: string;
  nameClassName?: string;
  meta?: string;
  badge?: { label: string; tone: BadgeTone };
  trailing?: React.ReactNode;
  onClick?: () => void;
}

export function ProjectRow({
  icon,
  name,
  nameClassName,
  meta,
  badge,
  trailing,
  onClick,
}: ProjectRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-2"
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn('truncate text-[13px]', nameClassName ?? 'text-fg')}>{name}</span>
        {meta ? <span className="truncate text-[11px] text-faint">{meta}</span> : null}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {badge ? (
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
              TONE[badge.tone],
            )}
          >
            {badge.label}
          </span>
        ) : null}
        {trailing}
      </span>
    </button>
  );
}
