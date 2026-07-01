import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, GitMerge, ArrowUp, ArrowDown, Plus, AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { BranchPicker } from './BranchPicker';
import { cn } from '../lib/cn';
import type { GitBranches } from '@shared/ipc-contract';

/** The sync action a header button triggers. Each fetches first, then pushes or rebase-pulls. */
type SyncOp = 'pull' | 'push';

/**
 * Header branch pill: at-a-glance "is my work safe and in sync?" indicator that VS Code's title
 * bar doesn't offer. Encodes, next to the workspace name, the current branch plus its state —
 * uncommitted changes (●N), unpushed commits (↑N), commits behind the upstream (↓N), and commits
 * behind the default branch it'll merge into (⑂N, e.g. behind origin/dev — needs a rebase) — and
 * colors the pill by the most urgent of those. Clicking opens the branch switcher.
 *
 * The base-behind signal is independent of the upstream one: a feature branch with no upstream yet
 * (still "Publish Branch") can be fully local-clean while origin/dev has moved on under it. The
 * upstream ↓ only tracks the branch's own remote, so without this the pill stays silent on staleness
 * that the commit graph plainly shows.
 *
 * Color priority (worst state wins):
 *   behind/baseBehind > 0 → danger  (a plain push will be rejected, or the branch is stale; rebase)
 *   ahead  > 0            → warning (unpushed local commits)
 *   dirty only            → accent  (uncommitted work, but in sync with the remote)
 *   clean+synced          → muted   (nothing to do)
 */
export function BranchStatePill(): React.JSX.Element | null {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const branch = useWorkspaceStore((s) => s.branch);
  const changeCount = useWorkspaceStore((s) => s.changeCount);
  const ahead = useWorkspaceStore((s) => s.ahead);
  const behind = useWorkspaceStore((s) => s.behind);
  const hasUpstream = useWorkspaceStore((s) => s.hasUpstream);
  const baseBehind = useWorkspaceStore((s) => s.baseBehind);
  const base = useWorkspaceStore((s) => s.base);
  const syncTick = useWorkspaceStore((s) => s.syncTick);

  const [branches, setBranches] = useState<GitBranches>({ current: branch, all: [], defaultBranch: null });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState<{ x: number; y: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SyncOp | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Load the branch list lazily — only once the switcher is open — and keep it fresh while open.
  const load = useCallback(() => {
    if (!rootPath) return;
    void window.forge.gitBranches(rootPath).then((res) => {
      if (res.ok) setBranches(res.data);
    });
  }, [rootPath]);

  useEffect(() => {
    if (menu) load();
  }, [menu, load, syncTick]);

  // Safety net for the invisible create-branch backdrop: Escape dismisses it even when the input
  // has lost focus, and switching workspaces clears any popover left open on the previous repo —
  // so the full-screen backdrop can never be orphaned and freeze input across the app.
  useEffect(() => {
    if (!creating) return;
    setCreating(null);
    setNewName('');
    // Only re-run on a workspace change; `creating` deliberately omitted so opening the popover
    // doesn't immediately close itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath]);

  useEffect(() => {
    if (!creating) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setCreating(null);
        setNewName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);

  if (!rootPath || !branch) return null;

  const afterBranchChange = (): void => {
    if (!rootPath) return;
    void window.forge.gitBranch(rootPath).then((r) => {
      useWorkspaceStore.getState().setBranch(r.ok ? r.data : null);
    });
    useWorkspaceStore.getState().bumpSync();
  };

  const checkout = (name: string): void => {
    if (!rootPath) return;
    setError(null);
    void window.forge.gitCheckout(rootPath, name).then((res) => {
      if (res.ok) afterBranchChange();
      else setError(res.error.split('\n')[0]);
    });
  };

  const createBranch = (): void => {
    const name = newName.trim();
    if (!name || !rootPath) return;
    setError(null);
    void window.forge.gitCreateBranch(rootPath, name).then((res) => {
      setCreating(null);
      setNewName('');
      if (res.ok) afterBranchChange();
      else setError(res.error.split('\n')[0]);
    });
  };

  // Dismiss the create-branch popover and clear its draft. Kept as one callback so every exit path
  // (backdrop click, right-click, Escape) tears the (invisible, full-screen) backdrop down the same
  // way — an orphaned backdrop swallows every click/right-click in the whole window.
  const cancelCreate = useCallback(() => {
    setCreating(null);
    setNewName('');
  }, []);

  // The header arrows always fetch first: that refreshes the remote-tracking ref so a push isn't
  // rejected for being silently behind, and so the rebase-pull replays onto up-to-date commits.
  // afterBranchChange → bumpSync then refreshes the pill's ahead/behind counts.
  const runOp = (op: SyncOp): void => {
    if (!rootPath || busy) return;
    const root = rootPath;
    setBusy(op);
    setError(null);
    void window.forge
      .gitFetch(root)
      .then((fetched) => {
        if (!fetched.ok) return fetched;
        return op === 'push' ? window.forge.gitPush(root) : window.forge.gitPull(root);
      })
      .then((res) => {
        setBusy(null);
        if (res.ok) afterBranchChange();
        else setError(res.error.split('\n')[0]);
      });
  };

  const tone =
    behind > 0 || baseBehind > 0
      ? 'danger'
      : ahead > 0
        ? 'warning'
        : changeCount > 0
          ? 'accent'
          : 'clean';

  const toneRing = {
    danger: 'border-danger/40 hover:border-danger/60',
    warning: 'border-warning/40 hover:border-warning/60',
    accent: 'border-accent/40 hover:border-accent/60',
    clean: 'border-transparent hover:border-line-strong',
  }[tone];

  const title = [
    `Branch: ${branch}`,
    hasUpstream ? null : 'No upstream — not tracking a remote',
    changeCount > 0 ? `${changeCount} uncommitted change${changeCount === 1 ? '' : 's'}` : null,
    ahead > 0 ? `${ahead} commit${ahead === 1 ? '' : 's'} to push` : null,
    behind > 0 ? `${behind} commit${behind === 1 ? '' : 's'} behind — pull first` : null,
    baseBehind > 0
      ? `${baseBehind} commit${baseBehind === 1 ? '' : 's'} behind ${base} — rebase onto the default branch`
      : null,
    changeCount === 0 && ahead === 0 && behind === 0 && baseBehind === 0 && hasUpstream
      ? 'Clean and in sync'
      : null,
    '— click to switch branch',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-label={`Branch ${branch}, click to switch`}
        onClick={(e) => {
          if (menu) {
            setMenu(null);
            return;
          }
          setError(null);
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
        className={cn(
          'flex max-w-[14rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg',
          toneRing,
        )}
      >
        <GitBranch
          size={13}
          className={cn(
            'shrink-0',
            tone === 'danger'
              ? 'text-danger'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-accent',
          )}
        />
        <span className="truncate">{branch}</span>

        {changeCount > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 text-accent" title={`${changeCount} uncommitted`}>
            <span className="text-[10px] leading-none">●</span>
            {changeCount}
          </span>
        ) : null}

        {ahead > 0 ? (
          <span className="flex shrink-0 items-center text-warning" title={`${ahead} to push`}>
            <ArrowUp size={11} strokeWidth={2.5} />
            {ahead}
          </span>
        ) : null}

        {behind > 0 ? (
          <span className="flex shrink-0 items-center text-danger" title={`${behind} behind`}>
            <ArrowDown size={11} strokeWidth={2.5} />
            {behind}
          </span>
        ) : null}

        {baseBehind > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-danger"
            title={`${baseBehind} behind ${base} — rebase`}
          >
            <GitMerge size={11} strokeWidth={2.5} />
            {baseBehind}
          </span>
        ) : null}

        {tone === 'clean' && hasUpstream ? (
          <span className="shrink-0 text-[10px] leading-none text-success" title="Clean and in sync">
            ✓
          </span>
        ) : null}
      </button>

      <SyncArrow
        Icon={ArrowDown}
        title={
          hasUpstream
            ? `Fetch, then pull (rebase onto upstream)${behind > 0 ? ` — ${behind} behind` : ''}`
            : 'No upstream to pull from'
        }
        active={behind > 0}
        tone="danger"
        busy={busy === 'pull'}
        disabled={!hasUpstream || busy !== null}
        onClick={() => runOp('pull')}
      />
      <SyncArrow
        Icon={ArrowUp}
        title={
          hasUpstream
            ? `Fetch, then push${ahead > 0 ? ` — ${ahead} to push` : ''}`
            : 'No upstream to push to'
        }
        active={ahead > 0}
        tone="warning"
        busy={busy === 'push'}
        disabled={!hasUpstream || busy !== null}
        onClick={() => runOp('push')}
      />

      {error ? (
        <button
          type="button"
          title={error}
          aria-label={`Sync failed: ${error}`}
          onClick={() => setError(null)}
          className="flex shrink-0 items-center rounded-md p-1 text-danger hover:bg-danger/15"
        >
          <AlertCircle size={13} />
        </button>
      ) : null}

      {menu ? (
        <BranchPicker
          x={menu.x}
          y={menu.y}
          branches={branches.all}
          current={branches.current ?? branch}
          defaultBranch={branches.defaultBranch}
          onSelect={(name) => {
            checkout(name);
            setMenu(null);
          }}
          onCreate={() => {
            const r = btnRef.current?.getBoundingClientRect();
            setMenu(null);
            if (r) setCreating({ x: r.left, y: r.bottom + 4 });
          }}
          onClose={() => setMenu(null)}
          error={error}
        />
      ) : null}

      {creating
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                onMouseDown={cancelCreate}
                onContextMenu={(e) => {
                  // Without this, a right-click on the (invisible) backdrop neither closes it nor
                  // reaches the editor — the "can't right-click" trap.
                  e.preventDefault();
                  cancelCreate();
                }}
              />
              <div
                className="fixed z-50 w-64 rounded-md border border-line bg-surface-2 p-2 shadow-lg"
                style={{ left: creating.x, top: creating.y }}
              >
                <div className="flex items-center gap-1.5">
                  <Plus size={13} className="shrink-0 text-faint" />
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createBranch();
                      if (e.key === 'Escape') {
                        setCreating(null);
                        setNewName('');
                      }
                    }}
                    placeholder="new-branch-name"
                    className="w-full rounded border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
                  />
                </div>
                {error ? (
                  <p className="mt-1 truncate text-[11px] text-danger" title={error}>
                    {error}
                  </p>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * A compact up/down arrow button beside the pill that triggers a push or rebase-pull. Tints to its
 * `tone` when there's work to do (commits ahead/behind), pulses while its op is in flight.
 */
function SyncArrow({
  Icon,
  title,
  active,
  tone,
  busy,
  disabled,
  onClick,
}: {
  Icon: typeof ArrowUp;
  title: string;
  active: boolean;
  tone: 'warning' | 'danger';
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center rounded-md border border-transparent p-1 transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent',
        active ? (tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-muted',
      )}
    >
      <Icon size={14} strokeWidth={2.5} className={cn('shrink-0', busy && 'animate-pulse')} />
    </button>
  );
}
