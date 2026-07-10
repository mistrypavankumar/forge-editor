import { describe, it, expect } from 'vitest';
import type { CodeNode } from '@shared/ipc-contract';
import {
  matchRouteFile,
  matchComponents,
  componentUsages,
  matchGqlOperation,
  resolveSourceFile,
  normalizePathname,
} from './resolver';

/** Build a CodeNode with sensible defaults for the fields the resolver ignores. */
function node(partial: Partial<CodeNode> & Pick<CodeNode, 'rel' | 'kind'>): CodeNode {
  return {
    path: `/repo/${partial.rel}`,
    name: partial.rel.split('/').pop() ?? partial.rel,
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
  } as CodeNode;
}

describe('normalizePathname', () => {
  it('adds leading slash and strips trailing slash', () => {
    expect(normalizePathname('dashboard/')).toBe('/dashboard');
    expect(normalizePathname('/')).toBe('/');
    expect(normalizePathname('http://localhost:3000/a/b/')).toBe('/a/b');
  });
});

describe('matchRouteFile', () => {
  const nodes = [
    node({ rel: 'app/dashboard/procurement/supplier-fulfillment/page.tsx', kind: 'next-page', route: '/dashboard/procurement/supplier-fulfillment' }),
    node({ rel: 'app/dashboard/procurement/supplier-fulfillment/layout.tsx', kind: 'next-layout', route: '/dashboard/procurement/supplier-fulfillment' }),
    node({ rel: 'app/dashboard/procurement/[id]/page.tsx', kind: 'next-page', route: '/dashboard/procurement/[id]' }),
    node({ rel: 'app/page.tsx', kind: 'next-page', route: '/' }),
  ];

  it('maps a URL path to the matching page file (App Router)', () => {
    const m = matchRouteFile('/dashboard/procurement/supplier-fulfillment', nodes);
    expect(m?.rel).toBe('app/dashboard/procurement/supplier-fulfillment/page.tsx');
    expect(m?.confidence).toBe('high');
  });

  it('prefers page.tsx over layout.tsx for the same route', () => {
    const m = matchRouteFile('/dashboard/procurement/supplier-fulfillment', nodes);
    expect(m?.rel.endsWith('page.tsx')).toBe(true);
  });

  it('falls back to a dynamic segment when no literal match exists', () => {
    const m = matchRouteFile('/dashboard/procurement/12345', nodes);
    expect(m?.rel).toBe('app/dashboard/procurement/[id]/page.tsx');
    expect(m?.confidence).toBe('medium');
  });

  it('matches the root route', () => {
    expect(matchRouteFile('/', nodes)?.rel).toBe('app/page.tsx');
  });

  it('returns null when nothing matches', () => {
    expect(matchRouteFile('/no/such/route/here', nodes)).toBeNull();
  });

  it('ignores Next.js route groups and parallel-route slots in the route', () => {
    const grouped = [
      node({ rel: 'app/(redux)/dashboard/procurement/supplier-fulfillment/page.tsx', kind: 'next-page', route: '/(redux)/dashboard/procurement/supplier-fulfillment' }),
      node({ rel: 'app/(marketing)/@modal/settings/page.tsx', kind: 'next-page', route: '/(marketing)/@modal/settings' }),
    ];
    expect(matchRouteFile('/dashboard/procurement/supplier-fulfillment', grouped)?.rel).toBe(
      'app/(redux)/dashboard/procurement/supplier-fulfillment/page.tsx',
    );
    expect(matchRouteFile('/settings', grouped)?.rel).toBe('app/(marketing)/@modal/settings/page.tsx');
  });
});

describe('matchComponents', () => {
  const nodes = [
    node({
      rel: 'src/components/SupplierFulfillmentTable.tsx',
      kind: 'component',
      components: ['SupplierFulfillmentTable'],
      componentDetails: [{ name: 'SupplierFulfillmentTable', line: 42, column: 8 }],
    }),
    node({
      rel: 'src/legacy/SupplierFulfillmentTable.tsx',
      kind: 'component',
      components: ['SupplierFulfillmentTable'],
      componentDetails: [{ name: 'SupplierFulfillmentTable', line: 5, column: 1 }],
    }),
    node({ rel: 'src/components/Button.tsx', kind: 'component', components: ['Button'] }),
  ];

  it('returns the single match with its declaration position', () => {
    const m = matchComponents('Button', nodes);
    expect(m).toHaveLength(1);
    expect(m[0].line).toBe(1); // no componentDetails → falls back to file head
  });

  it('uses componentDetails line/column when present', () => {
    const m = matchComponents('SupplierFulfillmentTable', nodes);
    const primary = m.find((x) => x.rel === 'src/components/SupplierFulfillmentTable.tsx');
    expect(primary?.line).toBe(42);
    expect(primary?.column).toBe(8);
  });

  it('returns every match (for the picker) when a name is ambiguous', () => {
    expect(matchComponents('SupplierFulfillmentTable', nodes)).toHaveLength(2);
  });

  it('returns nothing for an unknown component', () => {
    expect(matchComponents('Nope', nodes)).toHaveLength(0);
  });
});

describe('componentUsages', () => {
  const nodes = [
    node({ rel: 'src/Button.tsx', kind: 'component', components: ['Button'], usedBy: ['src/Form.tsx', 'src/Page.tsx'] }),
    node({ rel: 'src/Form.tsx', kind: 'component', components: ['Form'] }),
    node({ rel: 'src/Page.tsx', kind: 'component', components: ['Page'] }),
  ];

  it('lists the files that import the declaring file, resolved to absolute paths', () => {
    const u = componentUsages('Button', nodes);
    expect(u.map((x) => x.rel)).toEqual(['src/Form.tsx', 'src/Page.tsx']);
    expect(u[0].path).toBe('/repo/src/Form.tsx');
  });

  it('returns nothing for an unknown component', () => {
    expect(componentUsages('Nope', nodes)).toHaveLength(0);
  });
});

describe('matchGqlOperation', () => {
  const nodes = [
    node({
      rel: 'src/hooks/useSupplierFulfillmentsQuery.ts',
      kind: 'graphql',
      gqlOps: [{ name: 'GetSupplierFulfillments', type: 'query' }],
      usedBy: ['src/components/SupplierFulfillmentTable.tsx'],
    }),
    node({
      rel: 'src/components/SupplierFulfillmentTable.tsx',
      kind: 'component',
      components: ['SupplierFulfillmentTable'],
    }),
    node({
      rel: 'src/graphql/fragments.ts',
      kind: 'graphql',
      gqlOps: [{ name: 'GetSupplierFulfillments', type: 'fragment' }],
    }),
  ];

  it('matches the defining file by operation name and surfaces usedBy files', () => {
    const m = matchGqlOperation('GetSupplierFulfillments', nodes);
    expect(m).toHaveLength(1);
    expect(m[0].rel).toBe('src/hooks/useSupplierFulfillmentsQuery.ts');
    expect(m[0].type).toBe('query');
    expect(m[0].usedBy.map((u) => u.rel)).toEqual(['src/components/SupplierFulfillmentTable.tsx']);
    expect(m[0].usedBy[0].path).toBe('/repo/src/components/SupplierFulfillmentTable.tsx');
  });

  it('ignores fragments with the same name', () => {
    const m = matchGqlOperation('GetSupplierFulfillments', nodes);
    expect(m.every((x) => x.type !== 'fragment')).toBe(true);
  });

  it('returns nothing for an unknown operation', () => {
    expect(matchGqlOperation('Nope', nodes)).toHaveLength(0);
  });
});

describe('resolveSourceFile', () => {
  it('passes through an absolute path', () => {
    expect(resolveSourceFile('/repo/src/x.tsx', '/repo')).toBe('/repo/src/x.tsx');
  });

  it('resolves a relative path against the workspace root', () => {
    expect(resolveSourceFile('src/x.tsx', '/repo')).toBe('/repo/src/x.tsx');
    expect(resolveSourceFile('./src/x.tsx', '/repo')).toBe('/repo/src/x.tsx');
  });

  it('strips a webpack line/col query suffix', () => {
    expect(resolveSourceFile('/repo/src/x.tsx?42:5', '/repo')).toBe('/repo/src/x.tsx');
  });

  it('rejects synthetic/non-file references', () => {
    expect(resolveSourceFile('webpack-internal:///./src/x.tsx', '/repo')).toBeNull();
    expect(resolveSourceFile(undefined, '/repo')).toBeNull();
  });

  it('rejects node_modules paths (never open library internals)', () => {
    expect(resolveSourceFile('/repo/node_modules/@mui/material/Tab.js', '/repo')).toBeNull();
    expect(resolveSourceFile('file:///repo/node_modules/@mui/base/ButtonBase.js', '/repo')).toBeNull();
  });

  it('decodes a file:// URL', () => {
    expect(resolveSourceFile('file:///repo/src/my%20comp.tsx', '/repo')).toBe('/repo/src/my comp.tsx');
  });
});
