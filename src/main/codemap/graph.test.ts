import { describe, it, expect } from 'vitest';
import { findCycles, classifyRisk, isEntrypoint } from './graph';

describe('findCycles', () => {
  it('finds a simple 2-node cycle', () => {
    const adj = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = findCycles(adj);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sort()).toEqual(['a', 'b']);
  });

  it('returns no cycles for a DAG', () => {
    const adj = new Map([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect(findCycles(adj)).toEqual([]);
  });

  it('detects a self-loop', () => {
    const adj = new Map([['a', ['a']]]);
    expect(findCycles(adj)).toEqual([['a']]);
  });

  it('handles a larger 3-node cycle plus acyclic tail', () => {
    const adj = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
      ['d', ['a']],
    ]);
    const cycles = findCycles(adj);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('classifyRisk', () => {
  it('flags auth code as high risk', () => {
    const r = classifyRisk('src/auth/session.ts', 1, 2);
    expect(r.risk).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/auth/i);
  });

  it('flags generated GraphQL as high risk', () => {
    expect(classifyRisk('src/gql/__generated__/types.ts', 0, 5).risk).toBe('high');
  });

  it('is high when many files depend on it', () => {
    expect(classifyRisk('src/util/helpers.ts', 10, 3).risk).toBe('high');
  });

  it('is medium for a few dependents', () => {
    expect(classifyRisk('src/util/format.ts', 4, 1).risk).toBe('medium');
  });

  it('is low for a local-only file', () => {
    expect(classifyRisk('src/features/Widget.tsx', 0, 1).risk).toBe('low');
  });
});

describe('isEntrypoint', () => {
  it('treats Next pages and index barrels as entrypoints', () => {
    expect(isEntrypoint('app/page.tsx', 'next-page', false)).toBe(true);
    expect(isEntrypoint('src/index.ts', 'module', false)).toBe(true);
    expect(isEntrypoint('vite.config.ts', 'config', false)).toBe(true);
  });

  it('does not treat a plain module as an entrypoint', () => {
    expect(isEntrypoint('src/features/thing.ts', 'module', false)).toBe(false);
  });
});
