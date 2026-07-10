import { describe, it, expect } from 'vitest';
import { parseSource, nextInfo, classifyKind } from './scan';

describe('parseSource', () => {
  it('collects imports with named/default/namespace forms', () => {
    const src = `
      import React from 'react';
      import { useMemo, useState } from 'react';
      import * as utils from './utils';
      import './styles.css';
    `;
    const p = parseSource('a.tsx', src);
    const react = p.imports.find((i) => i.spec === 'react' && i.default);
    expect(react?.default).toBe(true);
    const named = p.imports.find((i) => i.names.includes('useMemo'));
    expect(named?.names).toContain('useState');
    expect(p.imports.find((i) => i.spec === './utils')?.namespace).toBe(true);
    expect(p.imports.some((i) => i.spec === './styles.css')).toBe(true);
  });

  it('collects named + default exports', () => {
    const src = `
      export const a = 1;
      export function foo() {}
      export default function () {}
      export interface Thing {}
    `;
    const p = parseSource('m.ts', src);
    expect(p.exports).toContain('a');
    expect(p.exports).toContain('foo');
    expect(p.exports).toContain('default');
    expect(p.exports).toContain('Thing');
  });

  it('detects React components and hooks', () => {
    const src = `
      export function SupplierList() { return <div>hi</div>; }
      export const useSuppliers = () => 1;
      export const CONFIG = 3;
    `;
    const p = parseSource('SupplierList.tsx', src);
    expect(p.components).toContain('SupplierList');
    expect(p.hooks).toContain('useSuppliers');
    expect(p.components).not.toContain('CONFIG');
    // componentDetails carries the 1-based declaration position for click-to-open.
    const detail = p.componentDetails.find((c) => c.name === 'SupplierList');
    expect(detail).toBeDefined();
    expect(detail?.line).toBe(2); // leading newline puts the export on line 2
  });

  it('extracts gql from tagged templates', () => {
    const src = "import { gql } from 'x';\nconst Q = gql`query GetX { x }`;";
    const p = parseSource('q.ts', src);
    expect(p.gqlOps).toContainEqual({ type: 'query', name: 'GetX' });
  });

  it('treats re-exports as both an import edge and exports', () => {
    const p = parseSource('index.ts', "export { Button } from './Button';");
    expect(p.imports.some((i) => i.spec === './Button')).toBe(true);
    expect(p.exports).toContain('Button');
  });
});

describe('nextInfo', () => {
  it('derives an App Router page route (stripping route groups)', () => {
    expect(nextInfo('apps/web/app/(dash)/suppliers/[id]/page.tsx')).toEqual({
      kind: 'next-page',
      route: '/suppliers/[id]',
    });
  });

  it('classifies a route handler', () => {
    expect(nextInfo('app/api/health/route.ts')?.kind).toBe('next-route');
  });

  it('derives a Pages Router index route', () => {
    expect(nextInfo('pages/index.tsx')).toEqual({ kind: 'next-page', route: '/' });
  });

  it('returns null for non-Next files', () => {
    expect(nextInfo('src/components/Foo.tsx')).toBeNull();
  });
});

describe('classifyKind', () => {
  const empty = { imports: [], exports: [], components: [], componentDetails: [], hooks: [], gqlOps: [] };
  it('classifies by extension and content', () => {
    expect(classifyKind('a.graphql', empty)).toBe('graphql');
    expect(classifyKind('a.test.ts', empty)).toBe('test');
    expect(classifyKind('vite.config.ts', empty)).toBe('config');
    expect(classifyKind('a.css', empty)).toBe('style');
    expect(classifyKind('Foo.tsx', { ...empty, components: ['Foo'] })).toBe('component');
    expect(classifyKind('use-x.ts', { ...empty, hooks: ['useX'] })).toBe('hook');
  });
});
