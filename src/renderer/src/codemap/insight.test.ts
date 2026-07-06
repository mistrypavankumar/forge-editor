import { describe, it, expect } from 'vitest';
import type { CodeMap, CodeNode } from '@shared/ipc-contract';
import { deriveInsight, relForPath } from './insight';

function node(partial: Partial<CodeNode> & { rel: string }): CodeNode {
  return {
    path: `/ws/${partial.rel}`,
    name: partial.rel.split('/').pop() ?? partial.rel,
    kind: 'module',
    exports: [],
    components: [],
    hooks: [],
    gqlOps: [],
    dependsOn: [],
    usedBy: [],
    externalDeps: [],
    unusedExports: [],
    loc: 10,
    risk: 'low',
    riskReasons: [],
    unused: false,
    ...partial,
  };
}

function map(nodes: CodeNode[]): CodeMap {
  return {
    root: '/ws',
    nodes,
    cycles: [],
    stats: { files: nodes.length, edges: 0, components: 0, gqlOps: 0, cycles: 0, unused: 0 },
    generatedAt: 0,
    truncated: false,
    durationMs: 0,
  };
}

describe('relForPath', () => {
  it('makes an absolute path workspace-relative', () => {
    expect(relForPath(map([]), '/ws/src/a.ts')).toBe('src/a.ts');
  });
  it('returns null for a path outside the workspace', () => {
    expect(relForPath(map([]), '/other/a.ts')).toBeNull();
  });
});

describe('deriveInsight', () => {
  it('describes a component and collects routes from dependents', () => {
    const list = node({ rel: 'components/List.tsx', kind: 'component', components: ['List'], usedBy: ['app/page.tsx'] });
    const page = node({ rel: 'app/page.tsx', kind: 'next-page', route: '/', dependsOn: ['components/List.tsx'] });
    const insight = deriveInsight(map([list, page]), 'components/List.tsx');
    expect(insight?.description).toMatch(/React component: List/);
    expect(insight?.routes).toContain('/');
  });

  it('aggregates GraphQL from dependencies when the file has none', () => {
    const q = node({ rel: 'gql/suppliers.ts', kind: 'graphql', gqlOps: [{ type: 'query', name: 'GetSuppliers' }] });
    const comp = node({ rel: 'List.tsx', kind: 'component', dependsOn: ['gql/suppliers.ts'] });
    const insight = deriveInsight(map([q, comp]), 'List.tsx');
    expect(insight?.relatedGql).toContainEqual({ type: 'query', name: 'GetSuppliers' });
  });

  it('returns null for an unknown file', () => {
    expect(deriveInsight(map([]), 'nope.ts')).toBeNull();
  });
});
