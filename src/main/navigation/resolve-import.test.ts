import { describe, expect, it } from 'vitest';
import { tsPathCandidates } from './resolve-import';

const paths = {
  '@daxwell/configs': ['packages/configs/src/index.ts'],
  '@daxwell/configs/*': ['packages/configs/src/*'],
  '@daxwell/auth/*': ['packages/auth/src/*'],
};

describe('tsPathCandidates', () => {
  it('matches an exact alias key', () => {
    expect(tsPathCandidates('@daxwell/configs', paths)).toEqual(['packages/configs/src/index.ts']);
  });

  it('substitutes the wildcard capture', () => {
    expect(tsPathCandidates('@daxwell/configs/public', paths)).toContain('packages/configs/src/public');
    expect(tsPathCandidates('@daxwell/auth/client/views/auth0/auth0-sign-in-view', paths)).toEqual([
      'packages/auth/src/client/views/auth0/auth0-sign-in-view',
    ]);
  });

  it('returns nothing for unknown specifiers', () => {
    expect(tsPathCandidates('react', paths)).toEqual([]);
  });
});
