import { describe, expect, it } from 'vitest';
import { computeDiff } from './line-diff';

const lines = (s: string): string[] => s.split('\n');

describe('computeDiff', () => {
  it('reports no hunks for identical content', () => {
    expect(computeDiff(lines('a\nb\nc'), lines('a\nb\nc'))).toEqual([]);
  });

  it('detects a modified line', () => {
    const hunks = computeDiff(lines('a\nb\nc'), lines('a\nB\nc'));
    expect(hunks).toEqual([{ type: 'mod', modStart: 1, modEnd: 2, origStart: 1, origLines: ['b'] }]);
  });

  it('detects added lines', () => {
    const hunks = computeDiff(lines('a\nc'), lines('a\nb\nc'));
    expect(hunks).toEqual([{ type: 'add', modStart: 1, modEnd: 2, origStart: 1, origLines: [] }]);
  });

  it('detects deleted lines', () => {
    const hunks = computeDiff(lines('a\nb\nc'), lines('a\nc'));
    expect(hunks).toEqual([{ type: 'del', modStart: 1, modEnd: 1, origStart: 1, origLines: ['b'] }]);
  });

  it('detects a deletion at the top of the file', () => {
    const hunks = computeDiff(lines('a\nb\nc'), lines('b\nc'));
    expect(hunks).toEqual([{ type: 'del', modStart: 0, modEnd: 0, origStart: 0, origLines: ['a'] }]);
  });

  it('separates two independent change regions', () => {
    const hunks = computeDiff(lines('a\nb\nc\nd\ne'), lines('a\nB\nc\nd\nE'));
    expect(hunks).toEqual([
      { type: 'mod', modStart: 1, modEnd: 2, origStart: 1, origLines: ['b'] },
      { type: 'mod', modStart: 4, modEnd: 5, origStart: 4, origLines: ['e'] },
    ]);
  });

  it('round-trips a revert: applying origLines back yields the original', () => {
    const orig = lines('one\ntwo\nthree\nfour');
    const mod = lines('one\nTWO\nfour\nfive');
    const hunks = computeDiff(orig, mod);
    // Apply each hunk's origLines back into the modified array (right-to-left to keep indices valid).
    const restored = [...mod];
    for (const h of [...hunks].reverse()) {
      restored.splice(h.modStart, h.modEnd - h.modStart, ...h.origLines);
    }
    expect(restored).toEqual(orig);
  });
});
