import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyMatchTerms } from './fuzzy';

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

describe('fuzzyMatchTerms', () => {
  const path = 'apps/scm/src/sections/business-objects/equipment-group-list.tsx';

  it('matches when all space-separated terms are present, in any order', () => {
    expect(fuzzyMatchTerms('business-objects equipment', path).matched).toBe(true);
    expect(fuzzyMatchTerms('equipment business-objects', path).matched).toBe(true);
  });

  it('fails when any single term is absent', () => {
    expect(fuzzyMatchTerms('business-objects zzz', path).matched).toBe(false);
  });

  it('empty / whitespace query matches everything', () => {
    expect(fuzzyMatchTerms('', path)).toEqual({ matched: true, score: 0 });
    expect(fuzzyMatchTerms('   ', path)).toEqual({ matched: true, score: 0 });
  });
});
