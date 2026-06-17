import { Share2 } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

export function ContextPanel(): React.JSX.Element {
  return (
    <EmptyState
      icon={Share2}
      title="No context available"
      hint="Relationship analysis (related files, usage, dependencies) isn't connected yet."
    />
  );
}
