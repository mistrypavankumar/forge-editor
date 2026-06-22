import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { languageManager } from './typescript-service';

/** 1-based line/column of the Nth occurrence of `needle` in `content`. */
function locate(content: string, needle: string, occurrence = 1): { line: number; col: number } {
  let idx = -1;
  for (let i = 0; i < occurrence; i += 1) idx = content.indexOf(needle, idx + 1);
  const pre = content.slice(0, idx);
  return { line: pre.split('\n').length, col: idx - pre.lastIndexOf('\n') };
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    baseUrl: '.',
    paths: { '@app/*': ['./src/*'] },
  },
  include: ['src'],
});

const A = `export function greet(name: string): string {
  return \`hi \${name}\`;
}
`;

const B = `import { greet } from './a';
const x: number = greet('world');
export const y = x;
`;

const C = `import { greet } from '@app/a';
export const z = greet('aliased');
`;

describe('TypeScript language service', () => {
  let dir: string;
  let aPath: string;
  let bPath: string;
  let cPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-ls-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
    aPath = join(dir, 'src', 'a.ts');
    bPath = join(dir, 'src', 'b.ts');
    cPath = join(dir, 'src', 'c.ts');
    writeFileSync(aPath, A);
    writeFileSync(bPath, B);
    writeFileSync(cPath, C);
    languageManager.initializeProject(dir);
    languageManager.openDocument(aPath, A);
    languageManager.openDocument(bPath, B);
    languageManager.openDocument(cPath, C);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves go-to-definition across files', () => {
    const at = locate(B, 'greet(', 1); // the call site
    const defs = languageManager.getDefinition(bPath, at.line, at.col + 1);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].file.endsWith('a.ts')).toBe(true);
    expect(defs[0].line).toBe(1);
  });

  it('reports semantic diagnostics (type error)', () => {
    const diags = languageManager.getDiagnostics(bPath);
    expect(diags.some((d) => d.severity === 'error' && d.code === 2322)).toBe(true);
  });

  it('returns hover info for a symbol', () => {
    const at = locate(B, 'greet(', 1);
    const hover = languageManager.getHover(bPath, at.line, at.col + 1);
    expect(hover?.contents).toContain('greet');
  });

  it('resolves tsconfig path aliases (@app/*)', () => {
    const at = locate(C, 'greet(', 1);
    const defs = languageManager.getDefinition(cPath, at.line, at.col + 1);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].file.endsWith('a.ts')).toBe(true);
  });

  it('produces semantic tokens (groups of 5)', () => {
    const tokens = languageManager.getSemanticTokens(bPath);
    expect(tokens.data.length).toBeGreaterThan(0);
    expect(tokens.data.length % 5).toBe(0);
  });

  it('reflects live edits via updateDocument', () => {
    // Fix the type error by widening x to string; the 2322 diagnostic should clear.
    const fixed = B.replace('const x: number', 'const x: string');
    languageManager.updateDocument(bPath, fixed);
    const diags = languageManager.getDiagnostics(bPath);
    expect(diags.some((d) => d.code === 2322)).toBe(false);
  });
});
