import { useDebugStore } from '../stores/debug-store';
import { DebugControls } from './DebugControls';

/**
 * Floating transport bar, pinned top-center while a session is live, so stepping works without the
 * Run & Debug side panel open. Mirrors VS Code's debug toolbar.
 */
export function DebugToolbar(): React.JSX.Element | null {
  const status = useDebugStore((s) => s.status);
  if (status === 'inactive' || status === 'terminated') return null;

  const label =
    status === 'paused' ? 'Paused' : status === 'starting' ? 'Starting…' : 'Running';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-line bg-surface-2/95 px-1.5 py-1 shadow-lg backdrop-blur">
        <span className="px-1.5 text-[11px] font-medium text-muted">{label}</span>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <DebugControls />
      </div>
    </div>
  );
}
