import type { GenerateSkeletonResult } from '@shared/skeleton';

/**
 * Pure, dependency-free string transforms for applying a generated skeleton. Kept separate from
 * `actions.ts` (which pulls in Monaco and stores) so they can be unit-tested in isolation.
 */

const REACT_EXT = /\.(tsx|jsx)$/i;

export function isReactFileName(name: string): boolean {
  return REACT_EXT.test(name);
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '.';
}

/** The sibling file path for a new skeleton file, matching the source's extension. */
export function skeletonFilePath(sourceFileName: string, sourcePath: string, skeletonName: string): string {
  const ext = /\.jsx$/i.test(sourceFileName) ? '.jsx' : '.tsx';
  return `${dirOf(sourcePath)}/${skeletonName}${ext}`;
}

/** Merge the skeleton's required named imports into an existing `@mui/material` import, or add one. */
export function mergeSkeletonImports(code: string, result: GenerateSkeletonResult): string {
  const toAdd = result.importsToAdd ?? [];
  if (result.uiLibrary !== 'mui' || toAdd.length === 0) return code;

  const muiImport = /import\s*\{([^}]*)\}\s*from\s*(['"])@mui\/material\2/;
  const m = muiImport.exec(code);
  if (m) {
    const existing = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const missing = toAdd.filter((n) => !existing.includes(n));
    if (missing.length === 0) return code;
    const merged = [...existing, ...missing].join(', ');
    return code.replace(muiImport, `import { ${merged} } from '@mui/material'`);
  }
  return `import { ${toAdd.join(', ')} } from '@mui/material';\n${code}`;
}
