import {
  Play,
  Pause,
  Square,
  RotateCcw,
  ArrowDownToLine,
  ArrowUpFromLine,
  CornerDownRight,
} from 'lucide-react';
import { useDebugStore } from '../stores/debug-store';
import { IconButton } from './ui/IconButton';

/**
 * The transport controls for a debug session — continue/pause, step over/into/out, restart, stop.
 * Shared by the Run & Debug side panel and the floating toolbar so both stay in lockstep.
 */
export function DebugControls({ size = 16 }: { size?: number }): React.JSX.Element {
  const status = useDebugStore((s) => s.status);
  const paused = status === 'paused';
  const active = status !== 'inactive' && status !== 'terminated';
  const store = useDebugStore.getState;

  const btn = 'h-7 w-7';
  return (
    <div className="flex items-center gap-0.5">
      {paused ? (
        <IconButton label="Continue (F5)" className={`${btn} text-success`} onClick={() => store().resume()}>
          <Play size={size} className="fill-current" />
        </IconButton>
      ) : (
        <IconButton
          label="Pause"
          className={btn}
          disabled={!active}
          onClick={() => store().pause()}
        >
          <Pause size={size} />
        </IconButton>
      )}
      <IconButton label="Step Over (F10)" className={btn} disabled={!paused} onClick={() => store().stepOver()}>
        <CornerDownRight size={size} />
      </IconButton>
      <IconButton label="Step Into (F11)" className={btn} disabled={!paused} onClick={() => store().stepInto()}>
        <ArrowDownToLine size={size} />
      </IconButton>
      <IconButton label="Step Out (⇧F11)" className={btn} disabled={!paused} onClick={() => store().stepOut()}>
        <ArrowUpFromLine size={size} />
      </IconButton>
      <IconButton
        label="Restart"
        className={btn}
        disabled={!active}
        onClick={() => {
          store().stop();
          // Give the previous session a tick to tear down before relaunching.
          setTimeout(() => void store().start(), 150);
        }}
      >
        <RotateCcw size={size} />
      </IconButton>
      <IconButton label="Stop (⇧F5)" className={`${btn} text-danger`} disabled={!active} onClick={() => store().stop()}>
        <Square size={size} className="fill-current" />
      </IconButton>
    </div>
  );
}
