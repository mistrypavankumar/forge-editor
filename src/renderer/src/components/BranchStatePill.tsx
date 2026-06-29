import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { BranchPicker } from './BranchPicker';
import { cn } from '../lib/cn';
import type { GitBranches } from '@shared/ipc-contract';

/**
 * Header branch pill: at-a-glance "is my work safe and in sync?" indicator that VS Code's title
 * bar doesn't offer. Encodes, next to the workspace name, the current branch plus its state —
 * uncommitted changes (●N), unpushed commits (↑N), and commits behind the upstream (↓N) — and
 * colors the pill by the most urgent of those. Clicking opens the branch switcher.
 *
 * Color priority (worst state wins):
 *   behind > 0   → danger  (a plain push will be rejected; pull/rebase first)
 *   ahead  > 0   → warning (unpushed local commits)
 *   dirty only   → accent  (uncommitted work, but in sync with the remote)
 *   clean+synced → muted   (nothing to do)
 */
export function BranchStatePill(): React.JSX.Element | null {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const branch = useWorkspaceStore((s) => s.branch);
  const changeCount = useWorkspaceStore((s) => s.changeCount);
  const ahead = useWorkspaceStore((s) => s.ahead);
  const behind = useWorkspaceStore((s) => s.behind);
  const hasUpstream = useWorkspaceStore((s) => s.hasUpstream);
  const syncTick = useWorkspaceStore((s) => s.syncTick);

  const [branches, setBranches] = useState<GitBranches>({ current: branch, all: [], defaultBranch: null });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState<{ x: number; y: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const tone =
    behind > 0 ? 'danger' : ahead > 0 ? 'warning' : changeCount > 0 ? 'accent' : 'clean';

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
    changeCount === 0 && ahead === 0 && behind === 0 && hasUpstream ? 'Clean and in sync' : null,
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

        {tone === 'clean' && hasUpstream ? (
          <span className="shrink-0 text-[10px] leading-none text-success" title="Clean and in sync">
            ✓
          </span>
        ) : null}
      </button>

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
        />
      ) : null}

      {creating
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => {
                  setCreating(null);
                  setNewName('');
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
