import { useEffect, useMemo, useState } from 'react';
import {
  Network,
  RefreshCw,
  Search,
  AlertTriangle,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Component,
  Anchor,
  FileCode2,
  Braces,
  Route,
  FlaskConical,
  Settings2,
  Palette,
  ExternalLink,
} from 'lucide-react';
import type { CodeMap, CodeNode, CodeNodeKind, RiskLevel } from '@shared/ipc-contract';
import { useCodemapStore } from '../codemap/store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { openFilePath } from '../lib/workspace-actions';
import { revealInTree } from '../lib/reveal-in-tree';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';

type MapTab = 'graph' | 'list' | 'cycles' | 'unused';

const KIND_ICON: Record<CodeNodeKind, typeof Component> = {
  component: Component,
  hook: Anchor,
  module: FileCode2,
  'next-page': Route,
  'next-layout': Route,
  'next-route': Route,
  'next-special': Route,
  graphql: Braces,
  test: FlaskConical,
  style: Palette,
  config: Settings2,
  other: FileCode2,
};

const RISK_TONE: Record<RiskLevel, string> = {
  high: 'text-danger',
  medium: 'text-amber-400',
  low: 'text-emerald-400',
};

function openNode(node: CodeNode): void {
  void openFilePath(node.path);
  void revealInTree(node.path);
}

function KindIcon({ kind, className }: { kind: CodeNodeKind; className?: string }): React.JSX.Element {
  const Icon = KIND_ICON[kind] ?? FileCode2;
  return <Icon size={13} className={className} />;
}

function RiskDot({ risk }: { risk: RiskLevel }): React.JSX.Element {
  return <span className={cn('text-[9px]', RISK_TONE[risk])} title={`${risk} risk`}>●</span>;
}

/** Focused ego-graph: usedBy → [file] → dependsOn, drawn as an SVG with connectors. */
function EgoGraph({
  map,
  node,
  onSelect,
}: {
  map: CodeMap;
  node: CodeNode;
  onSelect: (rel: string) => void;
}): React.JSX.Element {
  const byRel = useMemo(() => new Map(map.nodes.map((n) => [n.rel, n])), [map]);
  const MAX = 12;
  const left = node.usedBy.slice(0, MAX);
  const right = node.dependsOn.slice(0, MAX);
  const rows = Math.max(left.length, right.length, 1);
  const boxW = 188;
  const boxH = 26;
  const gapY = 12;
  const colGap = 90;
  const pad = 16;
  const width = boxW * 3 + colGap * 2 + pad * 2;
  const height = rows * (boxH + gapY) - gapY + pad * 2;
  const cx = pad + boxW + colGap;
  const centerY = height / 2 - boxH / 2;

  const colX = { left: pad, center: cx, right: cx + boxW + colGap };
  const yFor = (i: number, count: number): number => {
    const total = count * (boxH + gapY) - gapY;
    const start = (height - total) / 2;
    return start + i * (boxH + gapY);
  };

  const box = (rel: string, x: number, y: number, key: string): React.JSX.Element => {
    const n = byRel.get(rel);
    const base = rel.split('/').pop() ?? rel;
    return (
      <g
        key={key}
        transform={`translate(${x}, ${y})`}
        className="cursor-pointer"
        onClick={() => n && onSelect(n.rel)}
        onDoubleClick={() => n && openNode(n)}
      >
        <title>{`${rel}\n${n?.kind ?? ''} · used by ${n?.usedBy.length ?? 0}, depends on ${n?.dependsOn.length ?? 0}`}</title>
        <rect
          width={boxW}
          height={boxH}
          rx={6}
          fill="var(--surface-2)"
          stroke="var(--line)"
          strokeWidth={1}
        />
        <text x={10} y={boxH / 2 + 4} fontSize={11} fill="var(--fg)">
          {base.length > 26 ? `${base.slice(0, 25)}…` : base}
        </text>
      </g>
    );
  };

  return (
    <div className="overflow-auto p-2">
      <svg width={width} height={Math.max(height, 80)} style={{ maxWidth: 'none' }}>
        {/* connectors */}
        {left.map((rel, i) => {
          const y = yFor(i, left.length) + boxH / 2;
          return (
            <line
              key={`l-${rel}`}
              x1={colX.left + boxW}
              y1={y}
              x2={colX.center}
              y2={centerY + boxH / 2}
              stroke="var(--line)"
              strokeWidth={1}
            />
          );
        })}
        {right.map((rel, i) => {
          const y = yFor(i, right.length) + boxH / 2;
          return (
            <line
              key={`r-${rel}`}
              x1={colX.center + boxW}
              y1={centerY + boxH / 2}
              x2={colX.right}
              y2={y}
              stroke="var(--line)"
              strokeWidth={1}
            />
          );
        })}
        {/* boxes */}
        {left.map((rel, i) => box(rel, colX.left, yFor(i, left.length), `lb-${rel}`))}
        {right.map((rel, i) => box(rel, colX.right, yFor(i, right.length), `rb-${rel}`))}
        {/* center */}
        <g transform={`translate(${colX.center}, ${centerY})`} className="cursor-pointer" onClick={() => openNode(node)}>
          <title>{`${node.rel}\nClick to open`}</title>
          <rect width={boxW} height={boxH} rx={6} fill="var(--accent)" opacity={0.15} stroke="var(--accent)" />
          <text x={10} y={boxH / 2 + 4} fontSize={11} fill="var(--fg)" fontWeight={600}>
            {(node.name.length > 26 ? `${node.name.slice(0, 25)}…` : node.name)}
          </text>
        </g>
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[10px] uppercase tracking-wide text-faint" style={{ width }}>
        <span className="inline-flex items-center gap-1"><ArrowRight size={10} /> used by ({node.usedBy.length})</span>
        <span className="inline-flex items-center gap-1">depends on ({node.dependsOn.length}) <ArrowLeft size={10} /></span>
      </div>
    </div>
  );
}

export function CodebaseMapView(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const activePath = useEditorStore((s) => s.activePath);
  const { map, loading, error, root, build } = useCodemapStore();

  const [tab, setTab] = useState<MapTab>('graph');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<CodeNodeKind | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);

  // Build on open + when the workspace changes.
  useEffect(() => {
    if (rootPath && (root !== rootPath || (!map && !loading))) void build(rootPath);
  }, [rootPath, root, map, loading, build]);

  // Refresh on external file changes (main re-parses only what changed, so this is cheap).
  useEffect(() => {
    if (!rootPath) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = window.forge.onFsChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void build(rootPath, true), 800);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [rootPath, build]);

  // Follow the active editor file into the graph selection.
  const activeRel = useMemo(() => {
    if (!map || !activePath) return null;
    const rootPrefix = map.root.replace(/\/+$/, '') + '/';
    return activePath.startsWith(rootPrefix) ? activePath.slice(rootPrefix.length) : null;
  }, [map, activePath]);

  useEffect(() => {
    if (activeRel && map?.nodes.some((n) => n.rel === activeRel)) setSelected(activeRel);
  }, [activeRel, map]);

  const selectedNode = useMemo(
    () => map?.nodes.find((n) => n.rel === (selected ?? map.nodes[0]?.rel)) ?? null,
    [map, selected],
  );

  const filtered = useMemo(() => {
    if (!map) return [];
    const q = query.trim().toLowerCase();
    return map.nodes.filter(
      (n) => (kindFilter === 'all' || n.kind === kindFilter) && (!q || n.rel.toLowerCase().includes(q)),
    );
  }, [map, query, kindFilter]);

  if (!rootPath) {
    return <EmptyState icon={Network} title="Open a folder to map its dependencies" />;
  }

  if (loading && !map) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted">
        <RefreshCw size={14} className="animate-spin" /> Analyzing workspace…
      </div>
    );
  }

  if (error && !map) {
    return <EmptyState icon={AlertTriangle} title="Couldn't build the map" hint={error} />;
  }

  if (!map) return <EmptyState icon={Network} title="No analysis yet" />;

  const tabs: { id: MapTab; label: string; badge?: number }[] = [
    { id: 'graph', label: 'Graph' },
    { id: 'list', label: 'Files', badge: map.stats.files },
    { id: 'cycles', label: 'Cycles', badge: map.stats.cycles },
    { id: 'unused', label: 'Unused', badge: map.stats.unused },
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line-soft px-3 py-2">
        <Network size={15} className="text-accent" />
        <span className="text-[13px] font-medium text-fg">Codebase Map</span>
        <span className="text-[11px] text-faint">
          {map.stats.files} files · {map.stats.edges} deps · {map.stats.components} components ·{' '}
          {map.stats.gqlOps} gql
        </span>
        <button
          type="button"
          onClick={() => void build(rootPath, true)}
          title="Rebuild map"
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line-soft px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              tab === t.id ? 'bg-surface-3 text-fg' : 'text-faint hover:text-muted',
            )}
          >
            {t.label}
            {typeof t.badge === 'number' && t.badge > 0 ? (
              <span className="rounded-full bg-surface-3 px-1.5 text-[10px] leading-4 text-muted">{t.badge}</span>
            ) : null}
          </button>
        ))}
        {map.truncated ? (
          <span className="ml-auto text-[10px] text-amber-400">Truncated (large repo)</span>
        ) : null}
      </div>

      {/* Body */}
      {tab === 'graph' || tab === 'list' ? (
        <div className="flex min-h-0 flex-1">
          {/* File list rail */}
          <div className="flex w-72 shrink-0 flex-col border-r border-line-soft">
            <div className="flex items-center gap-1.5 border-b border-line-soft px-2 py-1.5">
              <Search size={12} className="text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter files…"
                className="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
              />
            </div>
            <div className="flex flex-wrap gap-1 border-b border-line-soft px-2 py-1.5">
              {(['all', 'component', 'hook', 'graphql', 'next-page'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] transition-colors',
                    kindFilter === k ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-faint hover:text-muted',
                  )}
                >
                  {k === 'all' ? 'All' : k === 'next-page' ? 'Pages' : k}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
              {filtered.map((n) => (
                <button
                  key={n.rel}
                  type="button"
                  onClick={() => setSelected(n.rel)}
                  onDoubleClick={() => openNode(n)}
                  title={n.rel}
                  className={cn(
                    'flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors',
                    selectedNode?.rel === n.rel ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2',
                  )}
                >
                  <KindIcon kind={n.kind} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{n.rel}</span>
                  {n.unused ? <Trash2 size={11} className="shrink-0 text-amber-400" /> : null}
                  <RiskDot risk={n.risk} />
                </button>
              ))}
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-faint">No files match.</p>
              ) : null}
            </div>
          </div>

          {/* Detail */}
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedNode ? (
              tab === 'graph' ? (
                <div>
                  <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
                    <KindIcon kind={selectedNode.kind} className="text-accent" />
                    <button
                      type="button"
                      onClick={() => openNode(selectedNode)}
                      className="min-w-0 flex-1 truncate text-left text-[13px] text-fg hover:underline"
                      title={selectedNode.rel}
                    >
                      {selectedNode.rel}
                    </button>
                    <RiskDot risk={selectedNode.risk} />
                    <span className="text-[10px] uppercase tracking-wide text-faint">{selectedNode.risk} risk</span>
                  </div>
                  <EgoGraph map={map} node={selectedNode} onSelect={setSelected} />
                </div>
              ) : (
                <NodeTable nodes={filtered} onSelect={setSelected} selected={selectedNode.rel} />
              )
            ) : (
              <EmptyState icon={Network} title="Select a file" />
            )}
          </div>
        </div>
      ) : tab === 'cycles' ? (
        <CyclesView map={map} />
      ) : (
        <UnusedView map={map} />
      )}
    </div>
  );
}

function NodeTable({
  nodes,
  onSelect,
  selected,
}: {
  nodes: CodeNode[];
  onSelect: (rel: string) => void;
  selected: string;
}): React.JSX.Element {
  return (
    <table className="w-full text-[12px]">
      <thead className="sticky top-0 bg-bg text-[10px] uppercase tracking-wide text-faint">
        <tr className="border-b border-line-soft">
          <th className="px-3 py-1.5 text-left font-medium">File</th>
          <th className="px-2 py-1.5 text-left font-medium">Kind</th>
          <th className="px-2 py-1.5 text-right font-medium">Deps</th>
          <th className="px-2 py-1.5 text-right font-medium">Used by</th>
          <th className="px-2 py-1.5 text-right font-medium">Risk</th>
          <th className="px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {nodes.map((n) => (
          <tr
            key={n.rel}
            onClick={() => onSelect(n.rel)}
            className={cn(
              'cursor-pointer border-b border-line-soft/50 transition-colors hover:bg-surface-2',
              selected === n.rel && 'bg-surface-2',
            )}
          >
            <td className="max-w-0 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <KindIcon kind={n.kind} className="shrink-0 text-faint" />
                <span className="truncate text-fg" title={n.rel}>{n.rel}</span>
                {n.unused ? <span className="shrink-0 text-[10px] text-amber-400">unused</span> : null}
              </div>
            </td>
            <td className="px-2 py-1.5 text-muted">{n.kind}</td>
            <td className="px-2 py-1.5 text-right text-muted">{n.dependsOn.length}</td>
            <td className="px-2 py-1.5 text-right text-muted">{n.usedBy.length}</td>
            <td className={cn('px-2 py-1.5 text-right', RISK_TONE[n.risk])}>{n.risk}</td>
            <td className="px-2 py-1.5 text-right">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openNode(n);
                }}
                title="Open file"
                className="text-faint hover:text-fg"
              >
                <ExternalLink size={12} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CyclesView({ map }: { map: CodeMap }): React.JSX.Element {
  const byRel = useMemo(() => new Map(map.nodes.map((n) => [n.rel, n])), [map]);
  if (map.cycles.length === 0) {
    return <EmptyState icon={Network} title="No circular dependencies" hint="Every import path is acyclic." />;
  }
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
      {map.cycles.map((cycle, i) => (
        <div key={i} className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
            <AlertTriangle size={12} /> Cycle of {cycle.length} files
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {cycle.map((rel, j) => {
              const n = byRel.get(rel);
              return (
                <span key={rel} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => n && openNode(n)}
                    className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg"
                    title={rel}
                  >
                    {rel.split('/').pop()}
                  </button>
                  <ArrowRight size={10} className="text-faint" />
                  {j === cycle.length - 1 ? (
                    <span className="font-mono text-[11px] text-faint">{cycle[0].split('/').pop()}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnusedView({ map }: { map: CodeMap }): React.JSX.Element {
  const unused = map.nodes.filter((n) => n.unused);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <p className="mb-2 text-[11px] text-faint">
        Files with exports that nothing else imports, excluding entrypoints (pages, routes, tests,
        config, index barrels). Heuristic — review before deleting.
      </p>
      {unused.length === 0 ? (
        <EmptyState icon={Trash2} title="No obviously unused files" />
      ) : (
        <div className="space-y-1">
          {unused.map((n) => (
            <button
              key={n.rel}
              type="button"
              onClick={() => openNode(n)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-surface-2"
              title={n.rel}
            >
              <KindIcon kind={n.kind} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{n.rel}</span>
              <span className="shrink-0 text-[10px] text-faint">{n.exports.length} exports</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
