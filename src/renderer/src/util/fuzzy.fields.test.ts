import { describe, expect, it } from 'vitest';
import { fuzzyMatchFields, fuzzyMatchPositions } from './fuzzy';

describe('fuzzyMatchPositions', () => {
  it('reports the matched indices for highlighting', () => {
    const r = fuzzyMatchPositions('mn', 'main.ts');
    expect(r.matched).toBe(true);
    expect(r.positions).toEqual([0, 3]); // m@0, n@3 in "main.ts"
  });

  it('matches an acronym across camelCase humps', () => {
    expect(fuzzyMatchPositions('ae', 'AppEditor').matched).toBe(true);
    expect(fuzzyMatchPositions('tovl', 'transfer-order-view-list').matched).toBe(true);
  });

  it('rewards word-boundary hits (separator) over mid-word ones', () => {
    const boundary = fuzzyMatchPositions('ov', 'transfer-order-view').score; // o at start of "order"
    const midword = fuzzyMatchPositions('ov', 'moviegoer').score;
    expect(boundary).toBeGreaterThan(midword);
  });
});

describe('fuzzyMatchFields', () => {
  it('prefers a name hit over the same term buried in the path', () => {
    const nameHit = fuzzyMatchFields('schema', 'transfer-order-schema.ts', 'apps/scm/x.ts');
    const pathHit = fuzzyMatchFields('schema', 'x.ts', 'apps/schema/x.ts');
    expect(nameHit.score).toBeGreaterThan(pathHit.score);
    expect(nameHit.primary.length).toBeGreaterThan(0);
    expect(pathHit.secondary.length).toBeGreaterThan(0);
  });

  it('matches order-independent terms across the two fields', () => {
    const r = fuzzyMatchFields('user slice', 'current-user-slice.ts', 'packages/redux/current-user-slice.ts');
    expect(r.matched).toBe(true);
  });

  it('fails when any term matches neither field', () => {
    expect(fuzzyMatchFields('user zzzz', 'current-user.ts', 'src/current-user.ts').matched).toBe(false);
  });
});
