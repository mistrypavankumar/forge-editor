import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, GitCommitVertical, GitBranch, Cloud, CircleDot, Tag, FileDiff, Plus, Minus, Undo2, FileSymlink, ChevronRight, ChevronDown, Lock } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useLayoutStore } from '../stores/layout-store';
import { openFilePath, openGitStagedDiff, openGitCommitDiff } from '../lib/workspace-actions';
import { isProtectedBranch } from '../lib/protected-branch';
import { deleteEntry } from '../lib/fs-actions';
import { computeGitGraph, edgePath, laneColor } from '../lib/git-graph';
import { PanelHeader } from './ui/Panel';
import { ModernFileIcon } from './ModernFileIcon';
import { GitBranchBar } from './GitBranchBar';
import { cn } from '../lib/cn';
import type { GitChange, GitCommit, GitRef } from '@shared/ipc-contract';

// Geometry for the commit-graph rail. Row height drives both the SVG and the rows (kept in sync).
const ROW_H = 24;
const FILE_ROW_H = 22; // a file row inside an expanded commit
const LANE_W = 14;
const PAD_X = 12;
const NODE_R = 4.5;
const EDGE_W = 2; // connector stroke width

const STATUS_CLS: Record<GitChange['status'], string> = {
  M: 'text-warning',
  A: 'text-success',
  D: 'text-danger',
  R: 'text-info',
  U: 'text-success',
};

// Icon + colour for each ref badge shown on the graph (current branch, local, remote, tag).
const REF_STYLE: Record<GitRef['kind'], { icon: typeof GitBranch; cls: string }> = {
  head: { icon: CircleDot, cls: 'bg-accent/20 text-accent' },
  branch: { icon: GitBranch, cls: 'bg-info/20 text-info' },
  remote: { icon: Cloud, cls: 'bg-warning/20 text-warning' },
  tag: { icon: Tag, cls: 'bg-success/20 text-success' },
};

function ChangeRow({
  change,
  onOpen,
  actions,
}: {
  change: GitChange;
  onOpen: () => void;
  actions: { icon: typeof Plus; label: string; onClick: () => void }[];
}): React.JSX.Element {
  return (
    <div
      onClick={onOpen}
      className="group flex h-7 cursor-pointer items-center gap-2 px-3 hover:bg-surface-2"
    >
      <ModernFileIcon name={change.name} />
      <span className="truncate text-[13px] text-muted">{change.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              aria-label={a.label}
              title={a.label}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
            >
              <a.icon size={13} />
            </button>
          ))}
        </span>
        <span className={cn('w-3 text-center font-mono text-[11px]', STATUS_CLS[change.status])}>
          {change.status}
        </span>
      </span>
    </div>
  );
}

function GroupHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count: number;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="group flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {title}
      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {actions}
      </span>
      <span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[10px] normal-case text-muted">
        {count}
      </span>
    </div>
  );
}

export function SourceControlPanel(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const branch = useWorkspaceStore((s) => s.branch);
  const syncTick = useWorkspaceStore((s) => s.syncTick);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  // Which commit is expanded to show its changed files, and those files.
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<GitChange[]>([]);

  // Resizable commit-graph pane: height lives in the layout store so it survives tab switches.
  const graphHeight = useLayoutStore((s) => s.scmGraphHeight);
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag the divider above the graph to resize it; height is measured up from the panel bottom.
  const startGraphResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const onMove = (ev: PointerEvent): void => {
      const fromBottom = rect.bottom - ev.clientY;
      const max = Math.max(120, rect.height - 240); // leave room for the changes list + commit box
      useLayoutStore.getState().setScmGraphHeight(Math.max(120, Math.min(fromBottom, max)));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // Cheap working-tree status only — safe to poll frequently.
  const refreshChanges = useCallback(() => {
    if (!rootPath) return;
    void window.forge.gitChangedFiles(rootPath).then((res) => {
      if (res.ok) setChanges(res.data);
    });
  }, [rootPath]);

  // Re-fetch the commit history (drives the graph). More expensive than status, so we only run it
  // on mount, after git actions, and when the ref signature shows history actually moved.
  const refreshLog = useCallback(() => {
    if (!rootPath) return;
    void window.forge.gitLog(rootPath, 50).then((res) => {
      if (res.ok) setCommits(res.data);
    });
  }, [rootPath]);

  // Full refresh (status + commit history); used on mount, focus, and after git actions.
  const refresh = useCallback(() => {
    refreshChanges();
    refreshLog();
  }, [refreshChanges, refreshLog]);

  // Last seen ref signature (HEAD + branch/remote tips). Lets the poll detect history changes
  // (rebase, commit, checkout, pull, reset) and refresh the graph only then — not every tick.
  const lastSig = useRef<string | null>(null);

  // Full load on mount / folder switch (status + commit history), priming the ref signature.
  useEffect(() => {
    lastSig.current = null; // forget the previous repo's signature so the first tick just primes
    refresh();
    if (!rootPath) return;
    void window.forge.gitRefsSig(rootPath).then((res) => {
      if (res.ok) lastSig.current = res.data;
    });
  }, [refresh, rootPath]);

  // On every workspace sync tick (AppShell's poll + the fs watcher): always refresh the cheap
  // working-tree status, and additionally re-fetch the commit log when the ref signature changed,
  // so the graph auto-syncs after a rebase/commit/checkout without re-running git log every poll.
  useEffect(() => {
    refreshChanges();
    if (!rootPath) return;
    void window.forge.gitRefsSig(rootPath).then((res) => {
      if (!res.ok) return;
      const changed = lastSig.current !== null && res.data !== lastSig.current;
      lastSig.current = res.data;
      if (changed) refreshLog();
    });
  }, [refreshChanges, refreshLog, rootPath, syncTick]);

  const graph = useMemo(() => computeGitGraph(commits), [commits]);
  const graphWidth = PAD_X + graph.lanes * LANE_W + 4;

  // Two-tone rail (VS Code-style): commits ahead of the remote — those above the first commit
  // carrying a remote-tracking ref — get the branch colour; the published history keeps its lane
  // colour. When no remote ref is in view we can't tell, so fall back to plain lane colours.
  const AHEAD_COLOR = 'var(--color-accent)'; // matches the current-branch (HEAD) chip
  const aheadCount = commits.findIndex((c) => c.refs.some((r) => r.kind === 'remote'));
  const railColor = (row: number, col: number): string =>
    aheadCount > 0 && row < aheadCount ? AHEAD_COLOR : laneColor(col);

  // Per-commit vertical offsets. The expanded commit's files push everything below it down, so the
  // SVG node/edge Y positions must account for that inserted block to stay aligned with the rows.
  const openIdx = openCommit ? commits.findIndex((c) => c.hash === openCommit) : -1;
  const filesBlock = openIdx !== -1 ? commitFiles.length * FILE_ROW_H : 0;
  const rowTop = (i: number): number => i * ROW_H + (openIdx !== -1 && i > openIdx ? filesBlock : 0);
  const svgHeight = commits.length * ROW_H + filesBlock;
  const cx = (col: number): number => PAD_X + col * LANE_W + LANE_W / 2;
  const cy = (i: number): number => rowTop(i) + ROW_H / 2;

  // Tracks the commit whose files were last requested, so a slow response for a since-closed
  // (or switched) commit is ignored.
  const reqCommit = useRef<string | null>(null);

  // Toggle a commit's file list, fetching the files the first time it opens.
  const toggleCommit = useCallback(
    (hash: string) => {
      if (openCommit === hash) {
        setOpenCommit(null);
        setCommitFiles([]);
        reqCommit.current = null;
        return;
      }
      setOpenCommit(hash);
      setCommitFiles([]);
      reqCommit.current = hash;
      if (!rootPath) return;
      void window.forge.gitCommitFiles(rootPath, hash).then((res) => {
        if (res.ok && reqCommit.current === hash) setCommitFiles(res.data);
      });
    },
    [openCommit, rootPath],
  );

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Source Control" />
        <p className="px-3 py-2 text-[12px] text-faint">Open a folder to use source control.</p>
      </div>
    );
  }
  const root = rootPath;

  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => c.unstaged);

  const stage = (c: GitChange): void => {
    void window.forge.gitStage(root, c.path).then(refresh);
  };
  const unstage = (c: GitChange): void => {
    void window.forge.gitUnstage(root, c.path).then(refresh);
  };
  const synced = (): void => {
    refresh();
    useWorkspaceStore.getState().bumpSync();
  };

  const discard = (c: GitChange): void => {
    if (!window.confirm(`Discard changes in "${c.name}"? This cannot be undone.`)) return;
    const op = c.status === 'U' ? deleteEntry(`${root}/${c.path}`) : window.forge.gitDiscard(root, c.path);
    void Promise.resolve(op).then(synced);
  };

  const locked = isProtectedBranch(branch);

  const commit = async (): Promise<void> => {
    if (!message.trim() || changes.length === 0) return;
    // Direct commits to protected branches (main/dev/…) are blocked — work belongs on a
    // feature branch. The button is disabled too; this guards against programmatic calls.
    if (locked) return;
    setCommitting(true);
    setCommitError(null);
    const res = await window.forge.gitCommit(root, message.trim());
    setCommitting(false);
    if (res.ok) {
      setMessage('');
      synced();
    } else {
      setCommitError(res.error);
    }
  };

  return (
    <div ref={panelRef} className="flex h-full flex-col">
      <PanelHeader
        title="Source Control"
        actions={
          <button
            type="button"
            aria-label="Refresh"
            onClick={refresh}
            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
          >
            <RefreshCw size={13} />
          </button>
        }
      />
      <GitBranchBar root={root} onChanged={refresh} />
      <div className="flex flex-col gap-2 px-2 pb-2 pt-2">
        <textarea
          rows={2}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (commitError) setCommitError(null);
          }}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter commits, mirroring the Commit button's enabled state.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!locked && !committing && message.trim() && changes.length > 0) void commit();
            }
          }}
          placeholder={
            locked ? `Message (${branch} is protected)` : `Message (commit on ${branch ?? 'branch'})`
          }
          className="resize-none rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-fg outline-none focus:border-accent/60 placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={locked || committing || !message.trim() || changes.length === 0}
          title={
            locked
              ? `"${branch}" is a protected branch — commit to a feature branch instead`
              : undefined
          }
          className="flex items-center justify-center gap-1.5 rounded-md bg-accent py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:bg-accent-hover disabled:opacity-40"
        >
          {locked ? <Lock size={13} /> : <GitCommitVertical size={14} />}
          Commit
        </button>
        {locked ? (
          <p className="px-0.5 text-[11px] leading-snug text-faint">
            <span className="text-warning">{branch}</span> is protected — commit to a feature branch
            instead.
          </p>
        ) : null}
        {commitError ? (
          <p className="whitespace-pre-wrap break-words rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] leading-snug text-danger">
            {commitError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {changes.length === 0 ? <p className="px-3 py-2 text-[12px] text-faint">No changes</p> : null}

        {staged.length > 0 ? (
          <>
            <GroupHeader title="Staged Changes" count={staged.length} />
            {staged.map((c) => (
              <ChangeRow
                key={`s-${c.path}`}
                change={c}
                onOpen={() => void openGitStagedDiff(root, c.path)}
                actions={[
                  {
                    icon: FileSymlink,
                    label: 'Open File',
                    onClick: () => void openFilePath(`${root}/${c.path}`, c.name),
                  },
                  { icon: Minus, label: 'Unstage', onClick: () => unstage(c) },
                ]}
              />
            ))}
          </>
        ) : null}

        {unstaged.length > 0 ? (
          <>
            <GroupHeader
              title="Changes"
              count={unstaged.length}
              actions={
                <button
                  type="button"
                  aria-label="Stage all changes"
                  title="Stage all changes"
                  onClick={() => void window.forge.gitStageAll(root).then(refresh)}
                  className="flex h-4 w-4 items-center justify-center rounded text-faint hover:text-fg"
                >
                  <Plus size={13} />
                </button>
              }
            />
            {unstaged.map((c) => (
              <ChangeRow
                key={`u-${c.path}`}
                change={c}
                onOpen={() => void openFilePath(`${root}/${c.path}`, c.name)}
                actions={[
                  { icon: Undo2, label: 'Discard changes', onClick: () => discard(c) },
                  { icon: Plus, label: 'Stage changes', onClick: () => stage(c) },
                ]}
              />
            ))}
          </>
        ) : null}
      </div>

      {/* Commit graph — a bottom pane the user can drag (the divider above) to resize. */}
      {commits.length > 0 ? (
        <div
          className="flex shrink-0 flex-col"
          style={showHistory ? { height: graphHeight } : undefined}
        >
          {showHistory ? (
            <div
              onPointerDown={startGraphResize}
              title="Drag to resize"
              className="group relative h-1.5 shrink-0 cursor-row-resize"
            >
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-soft transition-colors group-hover:bg-accent/60" />
            </div>
          ) : (
            <div className="border-t border-line-soft" />
          )}
          <div className="flex shrink-0 items-center gap-1 px-3 py-1">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-faint hover:text-muted"
            >
              {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Graph
            </button>
            {showHistory ? (
              <span className="ml-auto flex items-center gap-1.5">
                {branch ? (
                  <span className="flex items-center gap-1 text-[11px] text-muted" title="Current branch">
                    <GitBranch size={12} /> {branch}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Refresh graph"
                  title="Refresh"
                  onClick={refresh}
                  className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg"
                >
                  <RefreshCw size={12} />
                </button>
              </span>
            ) : null}
          </div>
          {showHistory ? (
            <div className="relative min-h-0 flex-1 overflow-auto pb-2">
                {/* Commit graph: coloured lanes + curved branch/merge connectors, drawn once
                    behind the rows. Rows are padded left to clear it. */}
                <svg
                  className="pointer-events-none absolute left-0 top-0"
                  width={graphWidth}
                  height={svgHeight}
                  aria-hidden
                >
                  {graph.edges.map((e) => (
                    <path
                      key={`${e.fromRow}-${e.toRow}-${e.toCol}`}
                      d={edgePath(
                        cx(e.fromCol),
                        cy(e.fromRow),
                        cx(e.toCol),
                        cy(e.toRow),
                        e.merge,
                        ROW_H * 0.7,
                      )}
                      fill="none"
                      stroke={e.merge ? e.color : railColor(e.fromRow, e.fromCol)}
                      strokeWidth={EDGE_W}
                      strokeLinecap="round"
                    />
                  ))}
                  {commits.map((c, i) => {
                    const color = railColor(i, graph.cols[i]);
                    const isHead = c.refs.some((r) => r.kind === 'head');
                    // HEAD reads as a hollow ring; every other commit is a solid filled node.
                    return (
                      <circle
                        key={c.hash}
                        cx={cx(graph.cols[i])}
                        cy={cy(i)}
                        r={isHead ? NODE_R + 0.5 : NODE_R}
                        fill={isHead ? 'var(--color-surface, #0d111b)' : color}
                        stroke={color}
                        strokeWidth={isHead ? 2.5 : 0}
                      />
                    );
                  })}
                </svg>
                {commits.map((c) => {
                  const isHead = c.refs.some((r) => r.kind === 'head');
                  const isOpen = c.hash === openCommit;
                  return (
                    <div key={c.hash}>
                      <div
                        onClick={() => toggleCommit(c.hash)}
                        className={cn(
                          'group flex cursor-pointer items-center gap-2 pr-3 hover:bg-surface-2',
                          isOpen && 'bg-surface-2',
                        )}
                        style={{ paddingLeft: graphWidth, height: ROW_H }}
                        title={`${c.subject}\n${c.hash} · ${c.author} · ${c.date}`}
                      >
                        <span
                          className={cn(
                            'min-w-0 truncate text-[13px]',
                            isHead ? 'font-semibold text-fg' : 'text-fg/85',
                          )}
                        >
                          {c.subject}
                        </span>
                        {c.refs.map((ref) => {
                          const { icon: Icon, cls } = REF_STYLE[ref.kind];
                          return (
                            <span
                              key={`${ref.kind}:${ref.name}`}
                              title={ref.name}
                              className={cn(
                                'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                cls,
                              )}
                            >
                              <Icon size={10} />
                              <span className="max-w-[200px] truncate">{ref.name}</span>
                            </span>
                          );
                        })}
                        {c.refs.length === 0 ? (
                          <span className="min-w-0 shrink truncate text-[11px] text-faint">
                            {c.author}
                          </span>
                        ) : null}
                        <FileDiff
                          size={13}
                          className={cn(
                            'ml-auto shrink-0 text-faint transition-opacity',
                            isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                          )}
                        />
                      </div>
                      {/* Files changed in this commit (click to diff against its parent). */}
                      {isOpen
                        ? commitFiles.map((f) => {
                            const dir = f.path.includes('/')
                              ? f.path.slice(0, f.path.lastIndexOf('/'))
                              : '';
                            return (
                              <div
                                key={f.path}
                                onClick={() => void openGitCommitDiff(root, c.hash, f.path, f.status)}
                                className="flex cursor-pointer items-center gap-2 pr-3 hover:bg-surface-2"
                                style={{ paddingLeft: graphWidth + 12, height: FILE_ROW_H }}
                                title={f.path}
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                  <ModernFileIcon name={f.name} size={14} />
                                </span>
                                <span className="shrink-0 truncate text-[12px] text-muted">
                                  {f.name}
                                </span>
                                {dir ? (
                                  <span className="min-w-0 shrink truncate text-[11px] text-faint">
                                    {dir}
                                  </span>
                                ) : null}
                                <span
                                  className={cn(
                                    'ml-auto w-3 shrink-0 text-center font-mono text-[11px]',
                                    STATUS_CLS[f.status],
                                  )}
                                >
                                  {f.status}
                                </span>
                              </div>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
        </div>
      ) : null}
    </div>
  );
}
