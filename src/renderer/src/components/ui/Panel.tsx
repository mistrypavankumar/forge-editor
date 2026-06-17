import { cn } from '../../lib/cn';

interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Compact uppercase section header used across side panels. */
export function PanelHeader({ title, actions, className }: PanelHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center justify-between px-3',
        'text-[11px] font-semibold uppercase tracking-wider text-muted',
        className,
      )}
    >
      <span className="truncate">{title}</span>
      {actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}

interface SectionLabelProps {
  children: React.ReactNode;
}

export function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  );
}
