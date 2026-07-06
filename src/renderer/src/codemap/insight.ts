import type { CodeMap, CodeNode, GqlOperation } from '@shared/ipc-contract';

/** The per-file card derived from the map for the active editor file. */
export interface FileInsight {
  node: CodeNode;
  /** One-line human description of what the file is. */
  description: string;
  /** Routes/pages related to this file (its own route + routes of pages that use it). */
  routes: string[];
  /** GraphQL operations tied to this file (its own, else those of its direct dependencies). */
  relatedGql: GqlOperation[];
}

/** Map an absolute path to a workspace-relative one for `map`, or null if outside the workspace. */
export function relForPath(map: CodeMap, absPath: string): string | null {
  const root = map.root.replace(/\/+$/, '') + '/';
  if (!absPath.startsWith(root)) return null;
  return absPath.slice(root.length);
}

function gqlSummary(ops: GqlOperation[]): string {
  const by = (t: string): number => ops.filter((o) => o.type === t).length;
  const bits: string[] = [];
  const q = by('query');
  const m = by('mutation');
  const s = by('subscription');
  const f = by('fragment');
  if (q) bits.push(`${q} quer${q === 1 ? 'y' : 'ies'}`);
  if (m) bits.push(`${m} mutation${m === 1 ? '' : 's'}`);
  if (s) bits.push(`${s} subscription${s === 1 ? '' : 's'}`);
  if (f) bits.push(`${f} fragment${f === 1 ? '' : 's'}`);
  return bits.join(', ') || 'GraphQL document';
}

function describe(node: CodeNode): string {
  switch (node.kind) {
    case 'component':
      return `React component${node.components.length > 1 ? 's' : ''}: ${node.components.join(', ')}`;
    case 'hook':
      return `Custom hook${node.hooks.length > 1 ? 's' : ''}: ${node.hooks.join(', ')}`;
    case 'next-page':
      return `Next.js page${node.route ? ` for ${node.route}` : ''}`;
    case 'next-layout':
      return `Next.js layout${node.route ? ` for ${node.route}` : ''}`;
    case 'next-route':
      return `Next.js route handler${node.route ? ` for ${node.route}` : ''}`;
    case 'next-special':
      return `Next.js ${node.name.replace(/\.[^.]+$/, '')}${node.route ? ` for ${node.route}` : ''}`;
    case 'graphql':
      return gqlSummary(node.gqlOps);
    case 'style':
      return 'Stylesheet';
    case 'test':
      return 'Test file';
    case 'config':
      return 'Configuration file';
    case 'module':
      return `Module exporting ${node.exports.length} symbol${node.exports.length === 1 ? '' : 's'}`;
    default:
      return 'Source file';
  }
}

/** Derive the insight card for one file from the map. Returns null when the file isn't a node. */
export function deriveInsight(map: CodeMap, rel: string): FileInsight | null {
  const byRel = new Map(map.nodes.map((n) => [n.rel, n]));
  const node = byRel.get(rel);
  if (!node) return null;

  const routes = new Set<string>();
  if (node.route) routes.add(node.route);
  for (const userRel of node.usedBy) {
    const u = byRel.get(userRel);
    if (u?.route) routes.add(u.route);
  }

  let relatedGql = node.gqlOps;
  if (relatedGql.length === 0) {
    const seen = new Set<string>();
    const agg: GqlOperation[] = [];
    for (const depRel of node.dependsOn) {
      for (const op of byRel.get(depRel)?.gqlOps ?? []) {
        const key = `${op.type}:${op.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          agg.push(op);
        }
      }
    }
    relatedGql = agg;
  }

  return { node, description: describe(node), routes: [...routes], relatedGql };
}
