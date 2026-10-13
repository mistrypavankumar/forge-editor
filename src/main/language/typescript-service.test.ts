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

  it('finds references to a symbol across files (powers the "N usages" CodeLens)', () => {
    const at = locate(A, 'greet', 1); // the declaration
    const refs = languageManager.getReferences(aPath, at.line, at.col + 1);
    // Declaration in a.ts + the two call sites in b.ts and c.ts.
    expect(refs.some((r) => r.file.endsWith('b.ts'))).toBe(true);
    expect(refs.some((r) => r.file.endsWith('c.ts'))).toBe(true);
  });

  it('finds implementations of an interface (powers the "N implementations" CodeLens)', () => {
    const iface = 'export interface Shape { area(): number; }\n';
    const impl = "import type { Shape } from './shape';\nexport class Circle implements Shape { area(): number { return 1; } }\n";
    const shapePath = join(dir, 'src', 'shape.ts');
    const circlePath = join(dir, 'src', 'circle.ts');
    writeFileSync(shapePath, iface);
    writeFileSync(circlePath, impl);
    languageManager.openDocument(shapePath, iface);
    languageManager.openDocument(circlePath, impl);
    const at = locate(iface, 'Shape', 1);
    const impls = languageManager.getImplementations(shapePath, at.line, at.col + 1);
    expect(impls.some((l) => l.file.endsWith('circle.ts'))).toBe(true);
  });
});

// Regression: a monorepo whose alias-defining tsconfig lives in the app folder, not the opened root.
describe('TypeScript language service — monorepo nested tsconfig', () => {
  let root: string;
  let appFile: string;

  const ROOT_TSCONFIG = JSON.stringify({ compilerOptions: { baseUrl: '.' } });
  const APP_TSCONFIG = JSON.stringify({
    extends: '../../tsconfig.json',
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
  });
  const SCHEMA = 'export type PlannedLeadTimeSchema = { id: string };\n';
  const VIEW = "import type { PlannedLeadTimeSchema } from '@/schema/planned-lead-time-schema';\nexport const s: PlannedLeadTimeSchema = { id: '1' };\n";

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-mono-ls-'));
    writeFileSync(join(root, 'tsconfig.json'), ROOT_TSCONFIG);
    const app = join(root, 'apps', 'scm');
    mkdirSync(join(app, 'src', 'schema'), { recursive: true });
    writeFileSync(join(app, 'tsconfig.json'), APP_TSCONFIG);
    writeFileSync(join(app, 'src', 'schema', 'planned-lead-time-schema.ts'), SCHEMA);
    appFile = join(app, 'src', 'view.tsx');
    writeFileSync(appFile, VIEW);
    // Open the monorepo ROOT as the workspace, exactly like the reported scenario.
    languageManager.initializeProject(root);
    languageManager.openDocument(appFile, VIEW);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('does not report "cannot find module" (2307) for an app-level `@/` alias', () => {
    const diags = languageManager.getDiagnostics(appFile);
    expect(diags.some((d) => d.code === 2307)).toBe(false);
  });

  it('resolves go-to-definition for the `@/` import', () => {
    const at = locate(VIEW, 'PlannedLeadTimeSchema', 1); // in the import clause
    const defs = languageManager.getDefinition(appFile, at.line, at.col + 1);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].file.endsWith('planned-lead-time-schema.ts')).toBe(true);
  });
});

describe('TypeScript language service — sibling tsconfig.test.json', () => {
  let app: string;
  let testFile: string;
  let srcFile: string;

  // Mirrors apps/scm: tsconfig.json excludes tests; tsconfig.test.json includes them and adds the
  // test-runner globals (`types: ["vitest/globals"]`) plus a `@tests/*` alias.
  const BASE = { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, baseUrl: '.' };
  const APP_TSCONFIG = JSON.stringify({
    compilerOptions: { ...BASE, types: [], paths: { '@/*': ['./src/*'] } },
    include: ['src'],
  });
  const TEST_TSCONFIG = JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: { types: ['fake-globals'], paths: { '@/*': ['./src/*'], '@tests/*': ['./tests/*'] } },
    include: ['src', 'tests'],
  });
  const GLOBALS = 'declare function expect(value: unknown): { toBe(other: unknown): void };\n';
  const HELPER = 'export const render = (): number => 1;\n';
  const TEST = "import { render } from '@tests/helpers/render';\nexpect(render()).toBe(1);\n";
  const SRC = 'export const usesExpect = typeof expect;\n';

  beforeAll(() => {
    app = mkdtempSync(join(tmpdir(), 'forge-testcfg-'));
    mkdirSync(join(app, 'src'), { recursive: true });
    mkdirSync(join(app, 'tests', 'helpers'), { recursive: true });
    mkdirSync(join(app, 'node_modules', 'fake-globals'), { recursive: true });
    writeFileSync(join(app, 'tsconfig.json'), APP_TSCONFIG);
    writeFileSync(join(app, 'tsconfig.test.json'), TEST_TSCONFIG);
    writeFileSync(join(app, 'node_modules', 'fake-globals', 'index.d.ts'), GLOBALS);
    writeFileSync(join(app, 'tests', 'helpers', 'render.ts'), HELPER);
    testFile = join(app, 'tests', 'a.test.ts');
    srcFile = join(app, 'src', 'b.ts');
    writeFileSync(testFile, TEST);
    writeFileSync(srcFile, SRC);
    languageManager.initializeProject(app);
    languageManager.openDocument(testFile, TEST);
    languageManager.openDocument(srcFile, SRC);
  });

  afterAll(() => rmSync(app, { recursive: true, force: true }));

  it('checks a test file under the config that includes it (globals + @tests alias resolve)', () => {
    const diags = languageManager.getDiagnostics(testFile);
    expect(diags.map((d) => d.code)).toEqual([]);
  });

  it('keeps app sources on tsconfig.json (test globals stay unknown there)', () => {
    const diags = languageManager.getDiagnostics(srcFile);
    expect(diags.some((d) => d.code === 2304)).toBe(true);
  });
});

describe('TypeScript language service — auto-import', () => {
  let dir: string;
  let cellPath: string;
  let usePath: string;

  const TSCONFIG_AI = JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
  });
  const CELL = 'export function renderLinkCell(name: string, href: string) {\n  return { name, href };\n}\n';
  // References `renderLinkCell` without importing it — the auto-import candidate.
  const USE = 'export const cell = renderLinkCell';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-ai-'));
    mkdirSync(join(dir, 'src', 'components'), { recursive: true });
    writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG_AI);
    cellPath = join(dir, 'src', 'components', 'cells.ts');
    usePath = join(dir, 'src', 'use.ts');
    writeFileSync(cellPath, CELL);
    writeFileSync(usePath, USE);
    languageManager.initializeProject(dir);
    languageManager.openDocument(cellPath, CELL);
    languageManager.openDocument(usePath, USE);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('offers an unimported symbol as a completion with a source module', () => {
    const at = locate(USE, 'renderLinkCell', 1);
    const { items } = languageManager.getCompletions(usePath, at.line, at.col + 'renderLinkCell'.length);
    const hit = items.find((i) => i.label === 'renderLinkCell' && i.source);
    expect(hit).toBeDefined();
    expect(hit?.source).toContain('cells');
  });

  it('resolves the auto-import edit (inserts the import statement)', () => {
    const at = locate(USE, 'renderLinkCell', 1);
    const col = at.col + 'renderLinkCell'.length;
    const hit = languageManager
      .getCompletions(usePath, at.line, col)
      .items.find((i) => i.label === 'renderLinkCell' && i.source);
    const detail = languageManager.getCompletionDetails(
      usePath,
      at.line,
      col,
      'renderLinkCell',
      hit?.source,
      hit?.data,
    );
    expect(detail).not.toBeNull();
    expect(detail?.additionalEdits.length).toBeGreaterThan(0);
    const importEdit = detail?.additionalEdits.find((e) => e.newText.includes('renderLinkCell'));
    expect(importEdit?.newText).toMatch(/import\s*\{\s*renderLinkCell\s*\}\s*from\s*['"].*cells['"]/s);
  });
});
