import type { CodeNodeKind, RiskLevel } from '@shared/ipc-contract';

/**
 * Find circular-dependency groups via Tarjan's strongly-connected-components algorithm (iterative,
 * so it survives large graphs without blowing the JS stack). Returns every SCC of size ≥ 2 plus any
 * single node that depends on itself. `adjacency` maps a node id to the ids it depends on.
 */
export function findCycles(adjacency: Map<string, string[]>, cap = 200): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  for (const start of adjacency.keys()) {
    if (indices.has(start)) continue;
    // Iterative DFS: each frame tracks its node and how far through its neighbours we are.
    const work: { node: string; i: number }[] = [{ node: start, i: 0 }];
    indices.set(start, index);
    low.set(start, index);
    index += 1;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbours = adjacency.get(frame.node) ?? [];
      if (frame.i < neighbours.length) {
        const next = neighbours[frame.i];
        frame.i += 1;
        if (!indices.has(next)) {
          indices.set(next, index);
          low.set(next, index);
          index += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, indices.get(next)!));
        }
      } else {
        // Done with this node's neighbours: propagate low-link to parent and close SCCs at roots.
        if (low.get(frame.node) === indices.get(frame.node)) {
          const scc: string[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
            if (w === frame.node) break;
          }
          const selfLoop = scc.length === 1 && (adjacency.get(scc[0]) ?? []).includes(scc[0]);
          if (scc.length >= 2 || selfLoop) cycles.push(scc.reverse());
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      }
      if (cycles.length >= cap) return cycles;
    }
  }
  return cycles;
}

/** Path fragments (lowercased, tested against the relative path) that raise a file to high risk. */
const HIGH_RISK_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /(^|\/)(auth|authentication|authorization|session|permission|rbac|acl)(\/|\.|s\/|$)/, reason: 'authentication / authorization code' },
  { re: /(^|\/)middleware\.[tj]sx?$/, reason: 'routing middleware' },
  { re: /(^|\/)(router|routes|routing)(\/|\.|$)/, reason: 'routing definition' },
  { re: /(generated|__generated__|\.generated\.)/, reason: 'generated code (regenerate rather than hand-edit)' },
  { re: /(^|\/)graphql\.[tj]sx?$/, reason: 'generated GraphQL types' },
  { re: /packages\/ui\//, reason: 'shared UI package' },
  { re: /\/components\/ui\//, reason: 'shared UI primitives' },
];

/** Barrel index at a package/src root is a public API surface. */
function isPublicApiBarrel(rel: string, exportsCount: number): boolean {
  return exportsCount > 0 && /(packages\/[^/]+\/src\/index|(^|\/)src\/index)\.[tj]sx?$/.test(rel);
}

/**
 * Classify how risky it is to change a file:
 *  - high: touches auth/routing/generated GraphQL/shared UI/public API, or has many dependents.
 *  - medium: several files depend on it.
 *  - low: local-only.
 */
export function classifyRisk(
  rel: string,
  usedByCount: number,
  exportsCount: number,
): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const lower = rel.toLowerCase();
  for (const { re, reason } of HIGH_RISK_PATTERNS) {
    if (re.test(lower)) reasons.push(reason);
  }
  if (isPublicApiBarrel(rel, exportsCount)) reasons.push('public API barrel (re-exported widely)');

  if (reasons.length > 0) {
    reasons.push(`${usedByCount} file${usedByCount === 1 ? '' : 's'} depend on it`);
    return { risk: 'high', reasons };
  }
  if (usedByCount >= 8) {
    return { risk: 'high', reasons: [`${usedByCount} files depend on it`] };
  }
  if (usedByCount >= 3) {
    return { risk: 'medium', reasons: [`${usedByCount} files depend on it`] };
  }
  return {
    risk: 'low',
    reasons: usedByCount === 0 ? ['local-only (no dependents)'] : [`${usedByCount} file(s) depend on it`],
  };
}

/**
 * Whether a file is an entrypoint — reachable outside the import graph (frameworks, tooling,
 * codegen, tests) — so an empty `usedBy` does NOT mean it's dead. Keeps "unused files" conservative.
 */
export function isEntrypoint(rel: string, kind: CodeNodeKind, hasGql: boolean): boolean {
  if (kind === 'next-page' || kind === 'next-layout' || kind === 'next-route' || kind === 'next-special') return true;
  if (kind === 'test' || kind === 'config' || kind === 'graphql') return true;
  if (hasGql) return true;
  const base = rel.split('/').pop() ?? rel;
  if (/^index\.[tj]sx?$/.test(base)) return true;
  if (/^main\.[tj]sx?$/.test(base)) return true;
  if (/\.config\.[tj]sx?$/.test(base)) return true;
  if (/\.d\.ts$/.test(base)) return true;
  if (/(^|\/)middleware\.[tj]sx?$/.test(rel)) return true;
  return false;
}
