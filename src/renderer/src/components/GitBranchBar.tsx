import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, Check, Plus, DownloadCloud, UploadCloud, RefreshCcw } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { BranchPicker } from './BranchPicker';
import { cn } from '../lib/cn';
import type { GitBranches } from '@shared/ipc-contract';

type Op = 'pull' | 'push' | 'fetch';

/** Branch indicator + switcher and pull/push/fetch controls for the Source Control panel. */
export function GitBranchBar({ root, onChanged }: { root: string; onChanged: () => void }): React.JSX.Element {
  const branch = useWorkspaceStore((s) => s.branch);
  const syncTick = useWorkspaceStore((s) => s.syncTick);
  const [branches, setBranches] = useState<GitBranches>({ current: branch, all: [] });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<Op | null>(null);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    void window.forge.gitBranches(root).then((res) => {
      if (res.ok) setBranches(res.data);
    });
  }, [root]);

  useEffect(() => load(), [load, syncTick]);

  const afterBranchChange = (): void => {
    void window.forge.gitBranch(root).then((r) => {
      useWorkspaceStore.getState().setBranch(r.ok ? r.data : null);
    });
    useWorkspaceStore.getState().bumpSync();
    onChanged();
    load();
  };

  const checkout = (name: string): void => {
    setError(null);
    void window.forge.gitCheckout(root, name).then((res) => {
      if (res.ok) afterBranchChange();
      else setError(res.error.split('\n')[0]);
    });
  };

  const createBranch = (): void => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    void window.forge.gitCreateBranch(root, name).then((res) => {
      setCreating(false);
      setNewName('');
      if (res.ok) afterBranchChange();
      else setError(res.error.split('\n')[0]);
    });
  };

  const runOp = (op: Op): void => {
    setBusy(op);
    setError(null);
    const call =
      op === 'pull'
        ? window.forge.gitPull(root)
        : op === 'push'
          ? window.forge.gitPush(root)
          : window.forge.gitFetch(root);
    void call.then((res) => {
      setBusy(null);
      if (res.ok) afterBranchChange();
      else setError(res.error.split('\n')[0]);
    });
  };

  const openMenu = (): void => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.left, y: r.bottom });
  };

  const opBtn =(op: Op, Icon: typeof DownloadCloud, label: string): React.JSX.Element => (
    <button
      type="button"
      title={label}
      disabled={busy !== null}
      onClick={() => runOp(op)}
      className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg disabled:opacity-40"
    >
      <Icon size={13} className={cn(busy === op && 'animate-pulse')} />
    </button>
  );

  return (
    <div className="border-b border-line-soft px-2 py-1.5">
      <div className="flex items-center gap-1">
        <button
          ref={btnRef}
          type="button"
          onClick={openMenu}
          title="Switch branch"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
        >
          <GitBranch size={13} className="shrink-0 text-accent" />
          <span className="truncate">{branches.current ?? branch ?? 'no branch'}</span>
        </button>
        {opBtn('fetch', RefreshCcw, 'Fetch')}
        {opBtn('pull', DownloadCloud, 'Pull')}
        {opBtn('push', UploadCloud, 'Push')}
      </div>

      {creating ? (
        <div className="mt-1.5 flex items-center gap-1">
          <Plus size={13} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createBranch();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder="new-branch-name"
            className="w-full rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
          />
          <button
            type="button"
            onClick={createBranch}
            className="shrink-0 rounded px-2 py-1 text-[11px] text-accent hover:bg-accent/15"
          >
            <Check size={13} />
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-1 truncate px-1 text-[11px] text-danger" title={error}>{error}</p> : null}

      {menu ? (
        <BranchPicker
          x={menu.x}
          y={menu.y}
          branches={branches.all}
          current={branches.current}
          onSelect={checkout}
          onCreate={() => setCreating(true)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
