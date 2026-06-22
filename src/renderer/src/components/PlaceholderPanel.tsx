import type { LucideIcon } from 'lucide-react';
import { PanelHeader } from './ui/Panel';
import { EmptyState } from './ui/EmptyState';

export function PlaceholderPanel({
  title,
  icon,
  hint,
}: {
  title: string;
  icon: LucideIcon;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={title} />
      <div className="min-h-0 flex-1">
        <EmptyState icon={icon} title={title} hint={hint} />
      </div>
    </div>
  );
}
