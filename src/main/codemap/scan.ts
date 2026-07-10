import ts from 'typescript';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import type { CodeNodeKind, ComponentLoc, GqlOperation } from '@shared/ipc-contract';
import { tsPathCandidates } from '../navigation/resolve-import';
import { extractGqlOperations } from './graphql';

/**
 * Per-file static analysis for the Codebase Map. Uses the TypeScript parser (syntactic only — no
 * type-checking or full Program) so a single file parses in well under a millisecond, and an
 * in-memory resolver that matches import specifiers against the already-scanned file set (no fs
 * stat storms). Everything here is pure given its inputs, so it's cheap to unit-test.
 */

export interface ParsedImport {
  spec: string;
  /** Named imports (`import { a, b }`). */
  names: string[];
  /** `import * as X` — makes the target's used-name set opaque. */
  namespace: boolean;
  /** Has a default import (`import X from`). */
  default: boolean;
}

export interface ParsedFile {
  imports: ParsedImport[];
  /** Exported symbol names (`default` for the default export). */
  exports: string[];
  components: string[];
  /** Component names paired with the 1-based position of their declaration (for click-to-open). */
  componentDetails: ComponentLoc[];
  hooks: string[];
  gqlOps: GqlOperation[];
}

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
const GQL_EXT = /\.(graphql|gql)$/i;
const STYLE_EXT = /\.(css|scss|less|sass)$/i;

/** Extensions considered "source" and included as graph nodes. */
export function isSourceFile(rel: string): boolean {
  return CODE_EXT.test(rel) || GQL_EXT.test(rel) || STYLE_EXT.test(rel);
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(mjs|cjs|js)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** PascalCase with at least one lowercase letter — excludes ALL_CAPS constants. */
function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name) && name.length > 1;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}

function hasDefaultModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false)
  );
}

/** Parse a code file into imports/exports/components/hooks/gql. `text` is the file's source. */
export function parseSource(fileName: string, text: string): ParsedFile {
  const isJsxFile = /\.(tsx|jsx)$/i.test(fileName);
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const imports: ParsedImport[] = [];
  const exportNames = new Set<string>();
  // Declaration position per exported name (1-based); 'default' holds the default export's position.
  const positions = new Map<string, { line: number; column: number }>();
  const gqlOps: GqlOperation[] = [];
  const gqlSeen = new Set<string>();
  let hasJsx = false;

  const posOf = (node: ts.Node): { line: number; column: number } => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { line: line + 1, column: character + 1 };
  };

  const addGql = (raw: string): void => {
    for (const op of extractGqlOperations(raw)) {
      const key = `${op.type}:${op.name}`;
      if (!gqlSeen.has(key)) {
        gqlSeen.add(key);
        gqlOps.push(op);
      }
    }
  };

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      const names: string[] = [];
      let namespace = false;
      let def = false;
      if (clause) {
        if (clause.name) def = true;
        const nb = clause.namedBindings;
        if (nb) {
          if (ts.isNamespaceImport(nb)) namespace = true;
          else for (const el of nb.elements) names.push(el.name.text);
        }
      }
      imports.push({ spec: st.moduleSpecifier.text, names, namespace, default: def });
    } else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        // Re-export: `export { a } from '…'` / `export * from '…'`.
        const spec = st.moduleSpecifier.text;
        if (st.exportClause && ts.isNamedExports(st.exportClause)) {
          const names = st.exportClause.elements.map((e) => e.name.text);
          for (const n of names) exportNames.add(n);
          imports.push({ spec, names, namespace: false, default: false });
        } else {
          // `export * from` — re-exports everything (target usage becomes opaque).
          imports.push({ spec, names: [], namespace: true, default: false });
        }
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) exportNames.add(e.name.text);
      }
    } else if (ts.isExportAssignment(st)) {
      if (!st.isExportEquals) {
        exportNames.add('default');
        positions.set('default', posOf(st.expression));
      }
    } else if (ts.isFunctionDeclaration(st) && hasExportModifier(st)) {
      if (hasDefaultModifier(st)) positions.set('default', posOf(st.name ?? st));
      if (hasDefaultModifier(st)) exportNames.add('default');
      if (st.name) {
        exportNames.add(st.name.text);
        positions.set(st.name.text, posOf(st.name));
      }
    } else if (ts.isClassDeclaration(st) && hasExportModifier(st)) {
      if (hasDefaultModifier(st)) positions.set('default', posOf(st.name ?? st));
      if (hasDefaultModifier(st)) exportNames.add('default');
      if (st.name) {
        exportNames.add(st.name.text);
        positions.set(st.name.text, posOf(st.name));
      }
    } else if (ts.isVariableStatement(st) && hasExportModifier(st)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exportNames.add(decl.name.text);
          positions.set(decl.name.text, posOf(decl.name));
        }
      }
    } else if (
      (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) &&
      hasExportModifier(st)
    ) {
      exportNames.add(st.name.text);
    }
  }

  // Walk the tree once for JSX presence + gql tagged templates.
  const visit = (node: ts.Node): void => {
    if (
      !hasJsx &&
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    ) {
      hasJsx = true;
    }
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      const tagName = ts.isIdentifier(tag)
        ? tag.text
        : ts.isPropertyAccessExpression(tag)
          ? tag.name.text
          : '';
      if (tagName === 'gql' || tagName === 'graphql') addGql(node.template.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const jsxCapable = isJsxFile || hasJsx;
  const components = [...exportNames].filter((n) => n !== 'default' && isPascalCase(n) && jsxCapable);
  const componentDetails: ComponentLoc[] = components.map((name) => {
    const p = positions.get(name) ?? { line: 1, column: 1 };
    return { name, line: p.line, column: p.column };
  });
  if (exportNames.has('default') && jsxCapable) {
    const baseName = (fileName.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    if (isPascalCase(baseName) && !components.includes(baseName)) {
      components.push(baseName);
      const p = positions.get('default') ?? { line: 1, column: 1 };
      componentDetails.push({ name: baseName, line: p.line, column: p.column });
    }
  }
  const hooks = [...exportNames].filter((n) => /^use[A-Z0-9]/.test(n));

  return { imports, exports: [...exportNames], components, componentDetails, hooks, gqlOps };
}

// ---- Next.js route detection ------------------------------------------------

const APP_SPECIAL: Record<string, CodeNodeKind> = {
  page: 'next-page',
  layout: 'next-layout',
  route: 'next-route',
  loading: 'next-special',
  error: 'next-special',
  'not-found': 'next-special',
  template: 'next-special',
  default: 'next-special',
  'global-error': 'next-special',
};

/** Detect a Next.js App-Router or Pages-Router file and derive its route path. */
export function nextInfo(rel: string): { kind: CodeNodeKind; route: string } | null {
  const parts = rel.split('/');
  const base = parts[parts.length - 1];

  const appIdx = parts.lastIndexOf('app');
  const special = /^([a-z-]+)\.[tj]sx?$/.exec(base);
  if (appIdx !== -1 && special && APP_SPECIAL[special[1]]) {
    const segs = parts
      .slice(appIdx + 1, parts.length - 1)
      .filter((p) => !(p.startsWith('(') && p.endsWith(')'))); // drop route groups
    const route = '/' + segs.join('/');
    return { kind: APP_SPECIAL[special[1]], route: route.length > 1 ? route.replace(/\/$/, '') : '/' };
  }

  const pagesIdx = parts.lastIndexOf('pages');
  if (pagesIdx !== -1 && /\.[tj]sx?$/.test(base) && !base.startsWith('_')) {
    const segs = parts.slice(pagesIdx + 1, parts.length - 1);
    let file = base.replace(/\.[tj]sx?$/, '');
    if (file === 'index') file = '';
    const route = '/' + [...segs, file].filter(Boolean).join('/');
    const kind: CodeNodeKind = parts.includes('api') ? 'next-route' : 'next-page';
    return { kind, route: route === '' ? '/' : route };
  }
  return null;
}

/** Primary classification of a file (used for grouping + entrypoint/risk heuristics). */
export function classifyKind(rel: string, parsed: ParsedFile): CodeNodeKind {
  const base = rel.split('/').pop() ?? rel;
  if (GQL_EXT.test(base)) return 'graphql';
  const nx = nextInfo(rel);
  if (nx) return nx.kind;
  if (/\.(test|spec)\.[tj]sx?$/.test(base) || /(^|\/)__tests__\//.test(rel)) return 'test';
  if (/\.config\.[tj]s$/.test(base)) return 'config';
  if (STYLE_EXT.test(base)) return 'style';
  if (parsed.components.length) return 'component';
  if (parsed.hooks.length) return 'hook';
  if (parsed.gqlOps.length) return 'graphql';
  if (parsed.imports.length || parsed.exports.length) return 'module';
  return 'other';
}

// ---- Import resolver (in-memory, cached tsconfig) ---------------------------

const PROBE_EXT = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.graphql', '.gql'];

function probeInSet(noExt: string, fileSet: Set<string>): string | null {
  if (fileSet.has(noExt)) return noExt;
  for (const ext of PROBE_EXT) if (fileSet.has(noExt + ext)) return noExt + ext;
  for (const ext of PROBE_EXT) {
    const indexed = `${noExt}/index${ext}`;
    if (fileSet.has(indexed)) return indexed;
  }
  return null;
}

function parseJsonish(raw: string): Record<string, unknown> | null {
  try {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface TsConfigInfo {
  baseDir: string;
  paths: Record<string, string[]>;
}

/**
 * Build a resolver that maps an import specifier to an absolute path within `fileSet`, honouring
 * relative paths and tsconfig `paths` aliases (bare npm packages resolve to null — external). The
 * tsconfig for each directory is read at most once via `readText` and cached.
 */
export function createResolver(
  rootPath: string,
  fileSet: Set<string>,
  readText: (path: string) => Promise<string | null>,
): (fromAbs: string, spec: string) => Promise<string | null> {
  const configByDir = new Map<string, TsConfigInfo | null>();

  async function loadConfig(dir: string): Promise<TsConfigInfo | null> {
    const cached = configByDir.get(dir);
    if (cached !== undefined) return cached;
    const tsconfigPath = `${dir}/tsconfig.json`;
    const raw = await readText(tsconfigPath);
    let info: TsConfigInfo | null = null;
    if (raw !== null) {
      const cfg = parseJsonish(raw);
      const compiler = (cfg?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> };
      let paths = compiler.paths ?? {};
      const baseUrl = compiler.baseUrl ?? '.';
      if (typeof cfg?.extends === 'string' && Object.keys(paths).length === 0) {
        const baseRaw = await readText(resolvePath(dir, cfg.extends));
        const base = baseRaw ? parseJsonish(baseRaw) : null;
        const baseCompiler = (base?.compilerOptions ?? {}) as { paths?: Record<string, string[]> };
        paths = { ...(baseCompiler.paths ?? {}), ...paths };
      }
      info = { baseDir: resolvePath(dir, baseUrl), paths };
    }
    configByDir.set(dir, info);
    return info;
  }

  async function findConfig(fromDir: string): Promise<TsConfigInfo | null> {
    let dir = fromDir;
    let fallback: TsConfigInfo | null = null;
    for (;;) {
      const cfg = await loadConfig(dir);
      if (cfg && Object.keys(cfg.paths).length > 0) return cfg;
      if (cfg && !fallback) fallback = cfg;
      if (dir === rootPath) break;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return fallback;
  }

  return async function resolve(fromAbs: string, spec: string): Promise<string | null> {
    if (spec.startsWith('.')) return probeInSet(resolvePath(dirname(fromAbs), spec), fileSet);
    if (isAbsolute(spec)) return probeInSet(spec, fileSet);
    const cfg = await findConfig(dirname(fromAbs));
    if (cfg) {
      for (const cand of tsPathCandidates(spec, cfg.paths)) {
        const hit = probeInSet(resolvePath(cfg.baseDir, cand), fileSet);
        if (hit) return hit;
      }
    }
    return null; // bare package → external dependency
  };
}
