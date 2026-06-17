import { FlaskConical } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

export function TestPanel(): React.JSX.Element {
  return (
    <EmptyState
      icon={FlaskConical}
      title="No test run yet"
      hint="Run your test command to see results here."
    />
  );
}
