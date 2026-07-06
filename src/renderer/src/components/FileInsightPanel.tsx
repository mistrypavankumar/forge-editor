import { useEffect, useMemo } from 'react';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  Braces,
  Route,
  ShieldAlert,
  Boxes,
  Trash2,
  Network,
  RefreshCw,
} from 'lucide-react';
import type { RiskLevel } from '@shared/ipc-contract';
import { useCodemapStore } from '../codemap/store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { deriveInsight, relForPath } from '../codemap/insight';
import { openFilePath, openCodebaseMap } from '../lib/workspace-actions';
import { revealInTree } from '../lib/reveal-in-tree';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';

const RISK_TONE: Record<RiskLevel, string> = {
  high: 'text-danger',
  medium: 'text-amber-400',
  low: 'text-emerald-400',
};

/** A clickable relative-path row (opens the file when it's inside the workspace). */
function FileLink({ rel, root }: { rel: string; root: string }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        const abs = `${root.replace(/\/+$/, '')}/${rel}`;
        void openFilePath(abs);
        void revealInTree(abs);
      }}
      title={rel}
      className="block w-full truncate text-left font-mono text-[11px] text-muted transition-colors hover:text-fg"
    >
      {rel}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Compass;
  title: string;
  count?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
        <Icon size={11} />
        {title}
        {typeof count === 'number' ? <span className="text-faint">({count})</span> : null}
      </div>
      {children}
    </section>
  );
}

export function FileInsightPanel(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const activePath = useEditorStore((s) => s.activePath);
  const { map, loading, error, root, build } = useCodemapStore();

  // Lazily build the map the first time the panel needs it.
  useEffect(() => {
    if (rootPath && (root !== rootPath || (!map && !loading))) void build(rootPath);
  }, [rootPath, root, map, loading, build]);

  const insight = useMemo(() => {
    if (!map || !activePath) return null;
    const rel = relForPath(map, activePath);
    return rel ? deriveInsight(map, rel) : null;
  }, [map, activePath]);

  if (!rootPath) return <EmptyState icon={Compass} title="Open a folder" />;
  if (loading && !map) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12px] text-muted">
        <RefreshCw size={13} className="animate-spin" /> Analyzing…
      </div>
    );
  }
  if (error && !map) return <EmptyState icon={Compass} title="Analysis failed" hint={error} />;
  if (!activePath) return <EmptyState icon={Compass} title="Open a file" hint="Its dependencies and risk show here." />;
  if (!insight) {
    return (
      <EmptyState
        icon={Compass}
        title="No insight for this file"
        hint="Only workspace source files are analyzed."
      />
    );
  }

  const { node, description, routes, relatedGql } = insight;
  const rootStr = map!.root;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {/* Summary */}
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-fg" title={node.rel}>
              {node.name}
            </span>
            <span className={cn('ml-auto inline-flex items-center gap-1 text-[10px] font-medium uppercase', RISK_TONE[node.risk])}>
              <ShieldAlert size={11} /> {node.risk}
            </span>
          </div>
          <p className="text-[12px] leading-snug text-muted">{description}</p>
          {node.route ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent">
              <Route size={11} /> {node.route}
            </p>
          ) : null}
        </div>

        {/* Risk reasons */}
        {node.riskReasons.length > 0 ? (
          <div
            className={cn(
              'rounded-lg border px-2.5 py-2 text-[11px] leading-snug',
              node.risk === 'high'
                ? 'border-danger/30 bg-danger/5 text-danger'
                : node.risk === 'medium'
                  ? 'border-amber-400/30 bg-amber-400/5 text-amber-400'
                  : 'border-line-soft bg-surface-2 text-muted',
            )}
          >
            {node.riskReasons.join(' · ')}
          </div>
        ) : null}

        {/* Exports */}
        {node.exports.length > 0 ? (
          <Section icon={Boxes} title="Exports" count={node.exports.length}>
            <div className="flex flex-wrap gap-1">
              {node.exports.map((e) => (
                <span
                  key={e}
                  className={cn(
                    'rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]',
                    node.unusedExports.includes(e) ? 'text-faint line-through' : 'text-muted',
                  )}
                  title={node.unusedExports.includes(e) ? 'Possibly unused (no importer references it)' : undefined}
                >
                  {e}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Depends on */}
        <Section icon={ArrowLeft} title="Depends on" count={node.dependsOn.length}>
          {node.dependsOn.length === 0 ? (
            <p className="text-[11px] text-faint">Nothing (leaf module).</p>
          ) : (
            <div className="space-y-0.5">
              {node.dependsOn.map((rel) => (
                <FileLink key={rel} rel={rel} root={rootStr} />
              ))}
            </div>
          )}
          {node.externalDeps.length > 0 ? (
            <p className="mt-1 text-[10px] text-faint">
              + {node.externalDeps.length} external: {node.externalDeps.slice(0, 6).join(', ')}
              {node.externalDeps.length > 6 ? '…' : ''}
            </p>
          ) : null}
        </Section>

        {/* Used by */}
        <Section icon={ArrowRight} title="Used by" count={node.usedBy.length}>
          {node.usedBy.length === 0 ? (
            <p className="text-[11px] text-faint">
              {node.unused ? 'Nothing imports this file (possibly unused).' : 'No internal dependents.'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {node.usedBy.map((rel) => (
                <FileLink key={rel} rel={rel} root={rootStr} />
              ))}
            </div>
          )}
        </Section>

        {/* Related GraphQL */}
        {relatedGql.length > 0 ? (
          <Section icon={Braces} title="Related GraphQL" count={relatedGql.length}>
            <div className="space-y-0.5">
              {relatedGql.map((op) => (
                <div key={`${op.type}:${op.name}`} className="flex items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-surface-2 px-1 py-0.5 text-[9px] uppercase text-faint">{op.type}</span>
                  <span className="truncate font-mono text-muted">{op.name}</span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Routes */}
        {routes.length > 0 ? (
          <Section icon={Route} title="Related routes / pages" count={routes.length}>
            <div className="flex flex-wrap gap-1">
              {routes.map((r) => (
                <span key={r} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {r}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {node.unused ? (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <Trash2 size={12} /> Not imported anywhere — review whether it's still needed.
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line-soft p-2">
        <button
          type="button"
          onClick={() => openCodebaseMap()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-2 py-1.5 text-[11px] text-muted transition-colors hover:text-fg"
        >
          <Network size={12} /> Open full Codebase Map
        </button>
      </div>
    </div>
  );
}
