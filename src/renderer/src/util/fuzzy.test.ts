import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyMatch('ape', 'AppEditor').matched).toBe(true);
  });

  it('does not match when characters are absent or out of order', () => {
    expect(fuzzyMatch('zzz', 'AppEditor').matched).toBe(false);
    expect(fuzzyMatch('ea', 'AppEditor').matched).toBe(false);
  });

  it('empty query matches with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ matched: true, score: 0 });
  });

  it('ranks contiguous and earlier matches higher', () => {
    const contiguous = fuzzyMatch('app', 'app-store').score;
    const scattered = fuzzyMatch('app', 'a-p-p-store').score;
    expect(contiguous).toBeGreaterThan(scattered);
  });
});
