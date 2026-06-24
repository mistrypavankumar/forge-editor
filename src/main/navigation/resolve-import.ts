import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

async function isFile(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Resolve a path that's missing its extension (or is a directory with an index file). */
async function probe(noExt: string): Promise<string | null> {
  if (await isFile(noExt)) return noExt;
  for (const ext of EXTENSIONS) {
    if (await isFile(noExt + ext)) return noExt + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexed = join(noExt, `index${ext}`);
    if (await isFile(indexed)) return indexed;
  }
  return null;
}

/** Tolerantly parse a tsconfig (strip comments + trailing commas). */
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

interface TsPaths {
  baseDir: string;
  paths: Record<string, string[]>;
}

/**
 * Walk up from `startDir` (inclusive) to `rootPath` (inclusive) for the nearest tsconfig.json,
 * returning its directory. In a monorepo the alias-defining config lives in the app/package folder
 * (e.g. `apps/scm/tsconfig.json` with `@/* → ./src/*`), not at the opened workspace root, so reading
 * only the root config misses every `@/…` alias. Mirrors how `tsc`/editors locate the config.
 */
async function findConfigDir(startDir: string, rootPath: string): Promise<string> {
  let dir = startDir;
  for (;;) {
    if (await isFile(join(dir, 'tsconfig.json'))) return dir;
    if (dir === rootPath) return rootPath;
    const parent = dirname(dir);
    if (parent === dir) return rootPath; // reached the filesystem root without a match
    dir = parent;
  }
}

async function readTsPaths(configDir: string): Promise<TsPaths> {
  const tsconfigPath = join(configDir, 'tsconfig.json');
  const raw = await fs.readFile(tsconfigPath, 'utf8').catch(() => null);
  const config = raw ? parseJsonish(raw) : null;
  const compiler = (config?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> };
  let paths: Record<string, string[]> = compiler.paths ?? {};
  const baseUrl = compiler.baseUrl ?? '.';

  // Merge one level of `extends` (the child's paths win).
  if (typeof config?.extends === 'string' && Object.keys(paths).length === 0) {
    const baseRaw = await fs
      .readFile(resolve(dirname(tsconfigPath), config.extends), 'utf8')
      .catch(() => null);
    const base = baseRaw ? parseJsonish(baseRaw) : null;
    const baseCompiler = (base?.compilerOptions ?? {}) as { paths?: Record<string, string[]> };
    paths = { ...(baseCompiler.paths ?? {}), ...paths };
  }
  return { baseDir: resolve(configDir, baseUrl), paths };
}

/** Candidate target paths for `spec` from tsconfig `paths` (exact key, then wildcard). Pure. */
export function tsPathCandidates(spec: string, paths: Record<string, string[]>): string[] {
  const out: string[] = [];
  if (paths[spec]) out.push(...paths[spec]);
  for (const key of Object.keys(paths)) {
    const star = key.indexOf('*');
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (spec.startsWith(prefix) && spec.endsWith(suffix) && spec.length >= prefix.length + suffix.length) {
      const captured = spec.slice(prefix.length, spec.length - suffix.length);
      for (const target of paths[key]) out.push(target.replace('*', captured));
    }
  }
  return out;
}

async function resolveInNodeModulesDir(modulesRoot: string, spec: string): Promise<string | null> {
  const pkgDir = join(modulesRoot, 'node_modules', spec);
  const pkgJson = parseJsonish((await fs.readFile(join(pkgDir, 'package.json'), 'utf8').catch(() => '')) || '{}');
  const entry = (pkgJson?.types ?? pkgJson?.typings ?? pkgJson?.main) as string | undefined;
  if (entry) {
    const resolved = await probe(join(pkgDir, entry));
    if (resolved) return resolved;
  }
  return probe(pkgDir);
}

/**
 * Resolve a bare package specifier by walking `node_modules` up from the importing file to the
 * workspace root — monorepos hoist most deps to the root but keep some in the package folder.
 */
async function resolveNodeModule(rootPath: string, fromFile: string, spec: string): Promise<string | null> {
  let dir = dirname(fromFile);
  for (;;) {
    const resolved = await resolveInNodeModulesDir(dir, spec);
    if (resolved) return resolved;
    if (dir === rootPath) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // `fromFile` may sit outside the workspace root; make sure the root is tried regardless.
  return resolveInNodeModulesDir(rootPath, spec);
}

/**
 * Resolve an import specifier to an absolute file path, or null. Handles relative imports,
 * tsconfig `paths` aliases, and node_modules packages.
 */
export async function resolveImport(
  rootPath: string,
  fromFile: string,
  spec: string,
): Promise<string | null> {
  if (spec.startsWith('.')) {
    return probe(resolve(dirname(fromFile), spec));
  }
  if (isAbsolute(spec)) {
    return probe(spec);
  }
  const configDir = await findConfigDir(dirname(fromFile), rootPath);
  const { baseDir, paths } = await readTsPaths(configDir);
  for (const candidate of tsPathCandidates(spec, paths)) {
    const resolved = await probe(resolve(baseDir, candidate));
    if (resolved) return resolved;
  }
  return resolveNodeModule(rootPath, fromFile, spec);
}
