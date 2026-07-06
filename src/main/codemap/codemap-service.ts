import { promises as fs } from 'node:fs';
import type { CodeMap, CodeNode, CodeNodeKind, GqlOperation } from '@shared/ipc-contract';
import { listFilesRecursive } from '../fs/fs-service';
import { readSettings } from '../settings/settings-service';
import { extractGqlOperations } from './graphql';
import { classifyKind, createResolver, isSourceFile, nextInfo, parseSource, type ParsedFile } from './scan';
import { classifyRisk, findCycles, isEntrypoint } from './graph';

/**
 * Codebase Map service (main process, off the render thread). Scans the workspace's source files
 * with the TypeScript parser, resolves imports against the file set, and assembles a dependency
 * graph with components / hooks / GraphQL ops / Next.js routes / circular deps / risk / unused files.
 *
 * Incremental: per-file parse results are cached by mtime, so a rebuild after an edit only re-parses
 * the files that actually changed. The assembled map is memoized per workspace and returned as-is
 * unless `force` is passed (the renderer forces after file-system changes).
 */

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
const GQL_EXT = /\.(graphql|gql)$/i;
/** Hard cap on files parsed, to keep very large monorepos responsive. */
const MAX_FILES = 4000;

interface FileRecord {
  rel: string;
  abs: string;
  mtimeMs: number;
  loc: number;
  parsed: ParsedFile;
  kind: CodeNodeKind;
  route?: string;
}

interface Workspace {
  records: Map<string, FileRecord>;
  map: CodeMap | null;
}

const workspaces = new Map<string, Workspace>();

function readText(path: string): Promise<string | null> {
  return fs.readFile(path, 'utf8').catch(() => null);
}

/** External package name from a bare specifier (`@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`). */
function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Parse one file into a {@link ParsedFile} based on its extension. */
function parseByExt(rel: string, text: string): ParsedFile {
  if (CODE_EXT.test(rel)) return parseSource(rel, text);
  if (GQL_EXT.test(rel)) {
    return { imports: [], exports: [], components: [], hooks: [], gqlOps: extractGqlOperations(text) };
  }
  return { imports: [], exports: [], components: [], hooks: [], gqlOps: [] };
}

/** Build (or return the memoized) dependency graph for `rootPath`. */
export async function buildCodeMap(
  rootPath: string,
  settingsPath: string,
  force = false,
): Promise<CodeMap> {
  const existing = workspaces.get(rootPath);
  if (!force && existing?.map) return existing.map;

  const startedAt = Date.now();
  // Reuse the same ignore list the file lister / quick-open use.
  const settings = await readSettings(settingsPath).catch(() => ({}) as { searchExclude?: string[] });
  const excludes = settings.searchExclude ?? [];
  const allFiles = await listFilesRecursive(rootPath, excludes);

  // Nodes: source files (excluding .d.ts). fileSet (for resolution) includes everything listed.
  const fileSet = new Set(allFiles.map((f) => f.path));
  const nodeFiles = allFiles
    .filter((f) => isSourceFile(f.relPath) && !f.relPath.endsWith('.d.ts'))
    .slice(0, MAX_FILES);
  const truncated =
    allFiles.filter((f) => isSourceFile(f.relPath) && !f.relPath.endsWith('.d.ts')).length > MAX_FILES;

  const prev = existing?.records ?? new Map<string, FileRecord>();
  const records = new Map<string, FileRecord>();

  // Parse (incrementally): reuse cached parse when the file's mtime is unchanged.
  let processed = 0;
  for (const f of nodeFiles) {
    let mtimeMs = 0;
    try {
      mtimeMs = (await fs.stat(f.path)).mtimeMs;
    } catch {
      continue; // vanished between listing and stat
    }
    const cached = prev.get(f.relPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      records.set(f.relPath, cached);
    } else {
      const text = await readText(f.path);
      if (text === null) continue;
      const parsed = parseByExt(f.relPath, text);
      const kind = classifyKind(f.relPath, parsed);
      const route = nextInfo(f.relPath)?.route;
      records.set(f.relPath, {
        rel: f.relPath,
        abs: f.path,
        mtimeMs,
        loc: text.length === 0 ? 0 : text.split('\n').length,
        parsed,
        kind,
        route,
      });
    }
    processed += 1;
    // Yield periodically so a big first scan doesn't stall the main event loop.
    if (processed % 200 === 0) await new Promise((r) => setImmediate(r));
  }

  // Resolve edges against the file set.
  const resolve = createResolver(rootPath, fileSet, readText);
  const absToRel = new Map<string, string>();
  for (const r of records.values()) absToRel.set(r.abs, r.rel);

  const dependsOn = new Map<string, Set<string>>();
  const usedBy = new Map<string, Set<string>>();
  const external = new Map<string, Set<string>>();
  // Per-target imported-name tracking, for the "possibly unused exports" signal.
  const usedNames = new Map<string, Set<string>>();
  const opaque = new Set<string>();
  for (const rel of records.keys()) {
    dependsOn.set(rel, new Set());
    usedBy.set(rel, new Set());
    external.set(rel, new Set());
    usedNames.set(rel, new Set());
  }

  for (const rec of records.values()) {
    for (const imp of rec.parsed.imports) {
      const targetAbs = await resolve(rec.abs, imp.spec);
      const targetRel = targetAbs ? absToRel.get(targetAbs) : undefined;
      if (targetRel && targetRel !== rec.rel) {
        dependsOn.get(rec.rel)!.add(targetRel);
        usedBy.get(targetRel)!.add(rec.rel);
        if (imp.namespace) opaque.add(targetRel);
        if (imp.default) usedNames.get(targetRel)!.add('default');
        for (const n of imp.names) usedNames.get(targetRel)!.add(n);
      } else if (!imp.spec.startsWith('.') && !targetAbs) {
        external.get(rec.rel)!.add(packageName(imp.spec));
      }
    }
  }

  // Assemble nodes with derived fields.
  const nodes: CodeNode[] = [];
  for (const rec of records.values()) {
    const deps = [...dependsOn.get(rec.rel)!].sort();
    const users = [...usedBy.get(rec.rel)!].sort();
    const exts = [...external.get(rec.rel)!].sort();
    const { risk, reasons } = classifyRisk(rec.rel, users.length, rec.parsed.exports.length);
    const canTrackNames = !opaque.has(rec.rel) && users.length > 0;
    const used = usedNames.get(rec.rel)!;
    const unusedExports = canTrackNames
      ? rec.parsed.exports.filter((e) => !used.has(e))
      : [];
    const unused =
      users.length === 0 &&
      rec.parsed.exports.length > 0 &&
      !isEntrypoint(rec.rel, rec.kind, rec.parsed.gqlOps.length > 0);

    nodes.push({
      path: rec.abs,
      rel: rec.rel,
      name: rec.rel.split('/').pop() ?? rec.rel,
      kind: rec.kind,
      exports: rec.parsed.exports,
      components: rec.parsed.components,
      hooks: rec.parsed.hooks,
      gqlOps: rec.parsed.gqlOps,
      route: rec.route,
      dependsOn: deps,
      usedBy: users,
      externalDeps: exts,
      unusedExports,
      loc: rec.loc,
      risk,
      riskReasons: reasons,
      unused,
    });
  }
  nodes.sort((a, b) => a.rel.localeCompare(b.rel));

  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n.rel, n.dependsOn);
  const cycles = findCycles(adjacency);

  const edgeCount = nodes.reduce((sum, n) => sum + n.dependsOn.length, 0);
  const gqlCount = nodes.reduce((sum, n) => sum + n.gqlOps.length, 0);
  const componentCount = nodes.reduce((sum, n) => sum + n.components.length, 0);
  const unusedCount = nodes.filter((n) => n.unused).length;

  const map: CodeMap = {
    root: rootPath,
    nodes,
    cycles,
    stats: {
      files: nodes.length,
      edges: edgeCount,
      components: componentCount,
      gqlOps: gqlCount,
      cycles: cycles.length,
      unused: unusedCount,
    },
    generatedAt: Date.now(),
    truncated,
    durationMs: Date.now() - startedAt,
  };

  workspaces.set(rootPath, { records, map });
  return map;
}

/** Drop cached analysis for a workspace (e.g. when the folder closes). */
export function clearCodeMap(rootPath: string): void {
  workspaces.delete(rootPath);
}
