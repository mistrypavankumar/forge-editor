import { AssistantPanel } from './AssistantPanel';

export function RightPanel(): React.JSX.Element {
  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface">
      <AssistantPanel />
    </aside>
  );
}
