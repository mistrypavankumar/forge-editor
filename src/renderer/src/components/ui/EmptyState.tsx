import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
}

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon size={22} strokeWidth={1.5} className="text-faint/60" />
      <p className="text-[13px] text-muted">{title}</p>
      {hint ? <p className="max-w-[240px] text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}
