import { describe, expect, it } from 'vitest';
import type { GenerateSkeletonResult } from '@shared/skeleton';
import { isReactFileName, mergeSkeletonImports, skeletonFilePath } from './transform';

const muiResult = (over: Partial<GenerateSkeletonResult> = {}): GenerateSkeletonResult => ({
  componentName: 'UserCard',
  skeletonName: 'UserCardSkeleton',
  uiLibrary: 'mui',
  generationMode: 'static-analysis',
  code: 'export function UserCardSkeleton() { return null; }',
  importsToAdd: ['Skeleton'],
  confidence: 'medium',
  ...over,
});

describe('isReactFileName', () => {
  it('accepts tsx/jsx and rejects others', () => {
    expect(isReactFileName('A.tsx')).toBe(true);
    expect(isReactFileName('A.jsx')).toBe(true);
    expect(isReactFileName('A.ts')).toBe(false);
    expect(isReactFileName('A.css')).toBe(false);
  });
});

describe('skeletonFilePath', () => {
  it('names the sibling file, matching the source extension', () => {
    expect(skeletonFilePath('UserCard.tsx', '/app/components/UserCard.tsx', 'UserCardSkeleton')).toBe(
      '/app/components/UserCardSkeleton.tsx',
    );
    expect(skeletonFilePath('Card.jsx', '/app/Card.jsx', 'CardSkeleton')).toBe('/app/CardSkeleton.jsx');
  });
});

describe('mergeSkeletonImports', () => {
  it('adds Skeleton to an existing @mui/material import', () => {
    const code = `import { Card, CardContent } from '@mui/material';\nexport const X = 1;`;
    expect(mergeSkeletonImports(code, muiResult())).toContain(
      "import { Card, CardContent, Skeleton } from '@mui/material';",
    );
  });

  it('is a no-op when Skeleton is already imported', () => {
    const code = `import { Card, Skeleton } from '@mui/material';`;
    expect(mergeSkeletonImports(code, muiResult())).toBe(code);
  });

  it('prepends a new import when @mui/material is not imported', () => {
    const code = `export const X = 1;`;
    expect(mergeSkeletonImports(code, muiResult())).toBe(
      `import { Skeleton } from '@mui/material';\nexport const X = 1;`,
    );
  });

  it('does nothing for non-MUI results', () => {
    const code = `export const X = 1;`;
    expect(mergeSkeletonImports(code, muiResult({ uiLibrary: 'tailwind', importsToAdd: undefined }))).toBe(code);
  });
});
