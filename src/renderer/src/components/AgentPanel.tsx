import { useMemo, useState } from 'react';
import {
  Bot,
  ArrowUp,
  Square,
  Check,
  X,
  Play,
  ListChecks,
  ChevronRight,
  ChevronDown,
  FilePlus2,
  FilePenLine,
  CircleCheck,
  CircleX,
  CircleDot,
  Loader2,
  RotateCcw,
  ClipboardList,
} from 'lucide-react';
import { useAgentStore } from '../stores/agent-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useTasksStore, runnableTasks } from '../stores/tasks-store';
import type { AgentCheck, FilePatch, TimelineEntry } from '../agent/types';
import {
  applyAll,
  applyPatch,
  approvePlan,
  previewPatch,
  rejectPatch,
  runChecks,
  startTask,
  stopAgent,
} from '../agent/orchestrator';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';

/** True while the agent is doing async work the user should be able to Stop. */
function isBusy(status: string | undefined): boolean {
  return status === 'planning' || status === 'editing' || status === 'checking';
}

function StatusPill({ status }: { status: string }): React.JSX.Element {
  const label: Record<string, string> = {
    idle: 'Idle',
    planning: 'Planning…',
    'plan-ready': 'Plan ready',
    editing: 'Drafting edits…',
    review: 'Review changes',
    checking: 'Running checks…',
    done: 'Done',
    error: 'Error',
    cancelled: 'Stopped',
  };
  const tone =
    status === 'error'
      ? 'text-danger'
      : status === 'done'
        ? 'text-emerald-400'
        : status === 'cancelled'
          ? 'text-faint'
          : 'text-accent';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', tone)}>
      {isBusy(status) ? <Loader2 size={11} className="animate-spin" /> : null}
      {label[status] ?? status}
    </span>
  );
}

function PatchRow({ patch }: { patch: FilePatch }): React.JSX.Element {
  const stateChip =
    patch.state === 'applied' ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
        <Check size={10} /> applied
      </span>
    ) : patch.state === 'rejected' ? (
      <span className="text-[10px] text-faint line-through">rejected</span>
    ) : null;

  return (
    <div
      className={cn(
        'rounded-lg border border-line-soft bg-surface-2 px-2.5 py-2 transition-opacity',
        patch.state === 'rejected' && 'opacity-50',
      )}
    >
      <button
        type="button"
        onClick={() => previewPatch(patch.path)}
        title="Open diff preview"
        className="group flex w-full items-center gap-2 text-left"
      >
        {patch.isNew ? (
          <FilePlus2 size={13} className="shrink-0 text-emerald-400" />
        ) : (
          <FilePenLine size={13} className="shrink-0 text-accent" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg group-hover:underline">
          {patch.path}
        </span>
        {stateChip}
      </button>
      {patch.description ? (
        <p className="mt-1 pl-[21px] text-[11px] leading-snug text-faint">{patch.description}</p>
      ) : null}
      {patch.state === 'pending' ? (
        <div className="mt-2 flex gap-1.5 pl-[21px]">
          <button
            type="button"
            onClick={() => void applyPatch(patch.path)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg transition-opacity hover:opacity-90"
          >
            <Check size={11} /> Apply
          </button>
          <button
            type="button"
            onClick={() => rejectPatch(patch.path)}
            className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
          >
            <X size={11} /> Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CheckRow({ check }: { check: AgentCheck }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const icon =
    check.status === 'running' ? (
      <Loader2 size={13} className="animate-spin text-accent" />
    ) : check.status === 'pass' ? (
      <CircleCheck size={13} className="text-emerald-400" />
    ) : (
      <CircleX size={13} className="text-danger" />
    );
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{check.label}</span>
        {check.durationMs > 0 ? (
          <span className="text-[10px] text-faint">{(check.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
        {open ? <ChevronDown size={13} className="text-faint" /> : <ChevronRight size={13} className="text-faint" />}
      </button>
      {open ? (
        <div className="border-t border-line-soft px-2.5 py-2">
          <p className="mb-1 font-mono text-[10px] text-faint">$ {check.command}</p>
          {check.errors.length > 0 ? (
            <ul className="mb-2 space-y-0.5">
              {check.errors.slice(0, 12).map((e, i) => (
                <li key={i} className="break-words font-mono text-[10px] leading-snug text-danger">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
          {check.output ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-bg/50 p-2 font-mono text-[10px] leading-snug text-muted">
              {check.output.slice(-4000)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }): React.JSX.Element {
  if (entry.type === 'tool') {
    const dot =
      entry.status === 'running' ? (
        <Loader2 size={10} className="animate-spin text-accent" />
      ) : entry.status === 'ok' ? (
        <CircleDot size={10} className="text-emerald-400/70" />
      ) : (
        <CircleX size={10} className="text-danger" />
      );
    return (
      <li className="flex items-center gap-2 text-[11px]">
        {dot}
        <span className="text-faint">{entry.tool}</span>
        <span className="min-w-0 flex-1 truncate text-muted">{entry.detail}</span>
      </li>
    );
  }
  const tone = entry.kind === 'error' ? 'text-danger' : entry.kind === 'plan' ? 'text-fg' : 'text-muted';
  return (
    <li className={cn('flex items-start gap-2 text-[11px]', tone)}>
      <CircleDot size={10} className="mt-0.5 shrink-0 text-faint/50" />
      <span className="min-w-0 flex-1 break-words">{entry.text}</span>
    </li>
  );
}

export function AgentPanel(): React.JSX.Element {
  const enabled = useAgentStore((s) => s.enabled);
  const setEnabled = useAgentStore((s) => s.setEnabled);
  const session = useAgentStore((s) => s.session);
  const reset = useAgentStore((s) => s.reset);

  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const pm = useTasksStore((s) => s.pm);
  const overrides = useTasksStore((s) => s.overrides);
  const custom = useTasksStore((s) => s.custom);

  const [draft, setDraft] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(false);

  const busy = isBusy(session?.status);

  // Available checks: plan-suggested commands plus the user's configured Test/Build/Lint tasks.
  const checkOptions = useMemo(() => {
    const opts: { label: string; command: string }[] = [];
    for (const c of session?.plan?.commands ?? []) opts.push({ label: c, command: c });
    for (const t of runnableTasks(pm, overrides, custom)) {
      if (['test', 'build', 'lint'].includes(t.key) && !opts.some((o) => o.command === t.command)) {
        opts.push({ label: t.label, command: t.command });
      }
    }
    return opts;
  }, [session?.plan?.commands, pm, overrides, custom]);

  if (!enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Bot size={22} strokeWidth={1.5} className="text-faint/60" />
        <p className="text-[13px] text-muted">AI Agent is turned off</p>
        <p className="max-w-[240px] text-[11px] text-faint">
          The agent can plan a task, propose multi-file edits, and run checks — always behind a
          reviewable diff.
        </p>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] text-accent-fg transition-opacity hover:opacity-90"
        >
          Enable Agent
        </button>
      </div>
    );
  }

  if (!rootPath) {
    return <EmptyState icon={Bot} title="Open a folder to use the agent" hint="The agent works within a workspace." />;
  }

  const run = (): void => {
    const task = draft.trim();
    if (!task || busy) return;
    void startTask(task, rootPath);
  };

  const plan = session?.plan;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Bot size={14} />
        </span>
        <span className="text-[12px] font-medium text-fg">Agent</span>
        {session ? <span className="ml-auto"><StatusPill status={session.status} /></span> : null}
      </div>

      {/* Task composer */}
      <div className="shrink-0 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface-2 p-2 focus-within:border-accent/50">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                run();
              }
            }}
            placeholder="Describe a task, e.g. “Add pagination to the supplier fulfillment list page.”  ⌘⏎ to run"
            className="max-h-32 flex-1 resize-none bg-transparent px-1 text-[13px] text-fg outline-none placeholder:text-faint"
          />
          {busy ? (
            <button
              type="button"
              aria-label="Stop agent"
              onClick={stopAgent}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-muted transition-colors hover:text-fg"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Run task"
              onClick={run}
              disabled={draft.trim().length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto border-t border-line-soft px-3 py-3">
        {!session ? (
          <p className="px-1 pt-2 text-[12px] leading-relaxed text-faint">
            The agent plans first, then proposes edits you review as diffs before anything is written
            to disk. Nothing runs until you approve it.
          </p>
        ) : null}

        {session?.error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {session.error}
          </div>
        ) : null}

        {/* Plan */}
        {plan ? (
          <section className="rounded-xl border border-line-soft bg-surface-2/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <ClipboardList size={12} /> Plan
            </div>
            {plan.summary ? <p className="mb-2 text-[12px] leading-snug text-fg">{plan.summary}</p> : null}
            {plan.steps.length > 0 ? (
              <ol className="mb-2 space-y-1">
                {plan.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted">
                    <span className="text-faint">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {plan.filesToEdit.length > 0 ? (
              <div className="mb-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Files to change</p>
                <ul className="space-y-0.5">
                  {plan.filesToEdit.map((f) => (
                    <li key={f.path} className="truncate font-mono text-[11px] text-muted" title={`${f.path} — ${f.reason}`}>
                      {f.path}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {session?.status === 'plan-ready' ? (
              <button
                type="button"
                onClick={() => void approvePlan()}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] text-accent-fg transition-opacity hover:opacity-90"
              >
                <Check size={13} /> Approve Plan
              </button>
            ) : null}
          </section>
        ) : null}

        {/* Changed files */}
        {session && session.patches.length > 0 ? (
          <section>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted">
                Changes ({session.patches.filter((p) => p.state !== 'rejected').length})
              </span>
              {session.patches.some((p) => p.state === 'pending') ? (
                <button
                  type="button"
                  onClick={() => void applyAll()}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[11px] text-fg transition-colors hover:bg-surface-2"
                >
                  <Check size={11} /> Apply All
                </button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              {session.patches.map((p) => (
                <PatchRow key={p.path} patch={p} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Checks */}
        {session && (checkOptions.length > 0 || session.checks.length > 0) ? (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <ListChecks size={12} /> Checks
            </div>
            {checkOptions.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void runChecks(checkOptions)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[11px] text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
                >
                  <Play size={11} /> Run Checks
                </button>
                {checkOptions.map((c) => (
                  <button
                    key={c.command}
                    type="button"
                    onClick={() => void runChecks([c])}
                    disabled={busy}
                    title={c.command}
                    className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg disabled:opacity-40"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="space-y-1.5">
              {session.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Timeline */}
        {session && session.timeline.length > 0 ? (
          <section className="border-t border-line-soft pt-2">
            <button
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[11px] font-medium text-faint hover:text-muted"
            >
              {timelineOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Activity timeline ({session.timeline.length})
            </button>
            {timelineOpen ? (
              <ul className="mt-2 space-y-1">
                {session.timeline.map((e) => (
                  <TimelineItem key={e.id} entry={e} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {/* New task */}
        {session && !busy ? (
          <button
            type="button"
            onClick={() => {
              reset();
              setDraft('');
            }}
            className="inline-flex items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-muted"
          >
            <RotateCcw size={11} /> Start a new task
          </button>
        ) : null}
      </div>
    </div>
  );
}
