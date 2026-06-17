import { GitBranch } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

export function ChangesPanel(): React.JSX.Element {
  return (
    <EmptyState
      icon={GitBranch}
      title="No source control provider"
      hint="Connect a Git provider to see changes, diffs, and commit suggestions."
    />
  );
}
