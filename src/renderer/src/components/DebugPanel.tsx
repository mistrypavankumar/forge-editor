import { useEffect, useState } from 'react';
import { Play, ChevronRight, ChevronDown, Circle } from 'lucide-react';
import type { DebugVariable } from '@shared/ipc-contract';
import { useDebugStore } from '../stores/debug-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { openFilePath } from '../lib/workspace-actions';
import { PanelHeader, SectionLabel } from './ui/Panel';
import { DebugControls } from './DebugControls';
import { RunPanel } from './RunPanel';
import { cn } from '../lib/cn';

/** One row in the variables tree; expands its children lazily by `reference`. */
function VarRow({ node, depth, defaultOpen }: { node: DebugVariable; depth: number; defaultOpen?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(!!defaultOpen);
  const [children, setChildren] = useState<DebugVariable[] | null>(null);
  const expandable = node.reference !== '';

  useEffect(() => {
    if (!open || !expandable || children !== null) return;
    let cancelled = false;
    void window.forge.debug.getVariables(node.reference).then((r) => {
      if (!cancelled && r.ok) setChildren(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, expandable, node.reference, children]);

  const isScope = node.type === 'scope';
  return (
    <div>
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: depth * 12 + 8 }}
        className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-[12px] hover:bg-surface-2 disabled:cursor-default"
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-faint">
          {expandable ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>
        <span className={cn('shrink-0 font-mono', isScope ? 'font-semibold text-muted' : 'text-accent')}>
          {node.name}
        </span>
        {!isScope ? (
          <>
            <span className="text-faint">:</span>
            <span className="truncate font-mono text-fg/90">{node.value}</span>
          </>
        ) : null}
      </button>
      {open && children
        ? children.map((c, i) => (
            <VarRow key={`${c.name}-${c.reference}-${i}`} node={c} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

function VariablesView({ frameId }: { frameId: string }): React.JSX.Element {
  const [scopes, setScopes] = useState<DebugVariable[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.forge.debug.getVariables(frameId).then((r) => {
      if (!cancelled && r.ok) setScopes(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [frameId]);
  if (scopes.length === 0) return <div className="px-3 py-1 text-[12px] text-faint">No variables.</div>;
  return (
    <div>
      {scopes.map((s, i) => (
        <VarRow key={s.reference || s.name} node={s} depth={0} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

export function DebugPanel(): React.JSX.Element {
  const status = useDebugStore((s) => s.status);
  const configs = useDebugStore((s) => s.configs);
  const activeConfigId = useDebugStore((s) => s.activeConfigId);
  const setActiveConfig = useDebugStore((s) => s.setActiveConfig);
  const frames = useDebugStore((s) => s.frames);
  const activeFrameId = useDebugStore((s) => s.activeFrameId);
  const selectFrame = useDebugStore((s) => s.selectFrame);
  const breakpoints = useDebugStore((s) => s.breakpoints);
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint);
  const start = useDebugStore((s) => s.start);
  const rootPath = useWorkspaceStore((s) => s.rootPath);

  // (Re)load launch configs whenever the workspace changes.
  useEffect(() => {
    void useDebugStore.getState().loadConfigs();
  }, [rootPath]);

  const active = status !== 'inactive' && status !== 'terminated';
  const bpList = Object.entries(breakpoints).flatMap(([file, lines]) =>
    lines.map((line) => ({ file, line })),
  );
  const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader title="Run & Debug" actions={active ? <DebugControls /> : undefined} />

      <div className="flex items-center gap-1.5 px-2 pb-2">
        <select
          value={activeConfigId}
          onChange={(e) => setActiveConfig(e.target.value)}
          disabled={active}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent/50 disabled:opacity-60"
        >
          {configs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void start()}
          disabled={active}
          title="Start Debugging (F5)"
          className="flex h-7 items-center gap-1 rounded-md bg-success/15 px-2.5 text-[12px] font-medium text-success hover:bg-success/25 disabled:opacity-50"
        >
          <Play size={13} className="fill-current" /> Start
        </button>
      </div>

      {active && status !== 'paused' ? (
        <div className="px-3 pb-2 text-[12px] text-faint">
          {status === 'starting' ? 'Starting…' : 'Running — press Pause or hit a breakpoint.'}
        </div>
      ) : null}

      {status === 'paused' ? (
        <>
          <SectionLabel>Call Stack</SectionLabel>
          <div className="pb-1">
            {frames.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => selectFrame(f.id)}
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-0.5 text-left text-[12px] hover:bg-surface-2',
                  f.id === activeFrameId && 'bg-surface-2',
                )}
              >
                <span className="truncate font-mono text-fg">{f.name}</span>
                <span className="ml-auto shrink-0 truncate font-mono text-[11px] text-faint">
                  {f.file ? `${baseName(f.file)}:${f.line}` : '—'}
                </span>
              </button>
            ))}
          </div>

          <SectionLabel>Variables</SectionLabel>
          <div className="pb-1">{activeFrameId ? <VariablesView frameId={activeFrameId} /> : null}</div>
        </>
      ) : null}

      <SectionLabel>Breakpoints</SectionLabel>
      <div className="pb-2">
        {bpList.length === 0 ? (
          <div className="px-3 py-1 text-[12px] text-faint">
            Click the editor gutter (or press F9) to add one.
          </div>
        ) : (
          bpList.map(({ file, line }) => (
            <div
              key={`${file}:${line}`}
              className="group flex items-center gap-2 px-3 py-0.5 text-[12px] hover:bg-surface-2"
            >
              <Circle size={9} className="shrink-0 fill-danger text-danger" />
              <button
                type="button"
                onClick={() => void openFilePath(file)}
                className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
              >
                <span className="truncate font-mono text-fg">{baseName(file)}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">:{line}</span>
              </button>
              <button
                type="button"
                onClick={() => toggleBreakpoint(file, line)}
                title="Remove breakpoint"
                className="shrink-0 text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Run tasks (dev/test/build/…) live under the same activity. */}
      <div className="mt-auto border-t border-line-soft pt-1">
        <RunPanel />
      </div>
    </div>
  );
}
