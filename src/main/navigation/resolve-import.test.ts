import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveImport, tsPathCandidates } from './resolve-import';

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

describe('resolveImport (monorepo nearest-tsconfig)', () => {
  /** Build a fixture mirroring daxwell-scm-client: alias `@/*` lives in apps/scm, not the root. */
  function makeMonorepo(): { root: string; fromFile: string } {
    const root = mkdtempSync(join(tmpdir(), 'forge-mono-'));
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.' } }));
    const app = join(root, 'apps', 'scm');
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, 'tsconfig.json'),
      JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }),
    );
    const schemaDir = join(app, 'src', 'sections', 'business-objects', 'schema');
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(join(schemaDir, 'planned-lead-time-schema.ts'), 'export type PlannedLeadTimeSchema = {};');
    const pagesDir = join(app, 'src', 'sections', 'business-objects', 'pages');
    mkdirSync(pagesDir, { recursive: true });
    const fromFile = join(pagesDir, 'planned-lead-times-list-view.tsx');
    writeFileSync(fromFile, '');
    return { root, fromFile };
  }

  it('resolves an `@/` alias defined in the app-level tsconfig, not the opened root', async () => {
    const { root, fromFile } = makeMonorepo();
    const resolved = await resolveImport(
      root,
      fromFile,
      '@/sections/business-objects/schema/planned-lead-time-schema',
    );
    expect(resolved).toBe(
      join(root, 'apps', 'scm', 'src', 'sections', 'business-objects', 'schema', 'planned-lead-time-schema.ts'),
    );
  });

  it('still resolves relative imports', async () => {
    const { root, fromFile } = makeMonorepo();
    const resolved = await resolveImport(root, fromFile, '../schema/planned-lead-time-schema');
    expect(resolved).toContain('planned-lead-time-schema.ts');
  });
});
