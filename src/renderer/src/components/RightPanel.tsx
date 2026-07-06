import { MessageSquare, Bot } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { cn } from '../lib/cn';
import { AssistantPanel } from './AssistantPanel';
import { AgentPanel } from './AgentPanel';
import { ErrorBoundary } from './ui/ErrorBoundary';

/** The right dock: a segmented Chat / Agent switch over the two assistant surfaces. */
export function RightPanel(): React.JSX.Element {
  const mode = useLayoutStore((s) => s.rightMode);
  const setMode = useLayoutStore((s) => s.setRightMode);

  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface">
      <div className="flex shrink-0 items-center gap-1 border-b border-line-soft px-2 py-1.5">
        <button
          type="button"
          onClick={() => setMode('chat')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
            mode === 'chat' ? 'bg-surface-3 text-fg' : 'text-faint hover:text-muted',
          )}
        >
          <MessageSquare size={12} /> Chat
        </button>
        <button
          type="button"
          onClick={() => setMode('agent')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
            mode === 'agent' ? 'bg-surface-3 text-fg' : 'text-faint hover:text-muted',
          )}
        >
          <Bot size={12} /> Agent
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'agent' ? (
          <ErrorBoundary label="Agent panel">
            <AgentPanel />
          </ErrorBoundary>
        ) : (
          <AssistantPanel />
        )}
      </div>
    </aside>
  );
}
