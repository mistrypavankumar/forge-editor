import { FileQuestion } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';

/** Shown in place of the editor when the active tab's content isn't editable text. */
export function BinaryFileView({ name }: { name: string }): React.JSX.Element {
  return (
    <div className="absolute inset-0 bg-bg">
      <EmptyState
        icon={FileQuestion}
        title={`${name} can't be shown`}
        hint="This looks like a binary file. Open it in an app that supports its format."
      />
    </div>
  );
}
