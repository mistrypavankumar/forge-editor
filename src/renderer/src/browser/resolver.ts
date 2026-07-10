import type { CodeNode } from '@shared/ipc-contract';

/**
 * Pure mapping from a clicked browser element back to a source file, using the Codebase Map
 * (`CodeNode[]`) as the project index. Three strategies, strongest first:
 *   1. an explicit source file (from `data-forge-*` metadata or React fiber `_debugSource`)
 *   2. the React component name → matching component export(s) in the index
 *   3. the browser URL path → the Next.js route file that serves it
 * Everything here is a pure function of its inputs, so it's cheap to unit-test.
 */

export interface SourceLocation {
  /** Absolute path. */
  path: string;
  line: number;
  column: number;
}

export interface ComponentMatch extends SourceLocation {
  /** Workspace-relative path (for display). */
  rel: string;
  name: string;
}

export interface RouteMatch extends SourceLocation {
  rel: string;
  route: string;
  confidence: 'high' | 'medium';
}

/** Normalize a URL pathname: ensure a leading slash, drop a trailing slash (except root). */
export function normalizePathname(p: string): string {
  let s = p || '/';
  try {
    // Accept a full URL too.
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch {
    /* keep as-is */
  }
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}

/** True for a Next.js dynamic segment: `[id]`, `[...slug]`, `[[...slug]]`. */
function isDynamic(seg: string): boolean {
  return seg.startsWith('[') && seg.endsWith(']');
}
function isCatchAll(seg: string): boolean {
  return seg.startsWith('[...') || seg.startsWith('[[...');
}

/**
 * Score how well a route pattern matches a URL path. Returns null when it can't match, else a score
 * where more literal (non-dynamic) segment matches rank higher. `dynamic` reports whether any
 * dynamic segment was consumed (→ lower confidence).
 */
function scoreRoute(
  routeSegs: string[],
  urlSegs: string[],
): { score: number; dynamic: boolean } | null {
  let ri = 0;
  let ui = 0;
  let score = 0;
  let dynamic = false;
  while (ri < routeSegs.length) {
    const seg = routeSegs[ri];
    if (isCatchAll(seg)) {
      dynamic = true;
      const optional = seg.startsWith('[[');
      const remaining = urlSegs.length - ui;
      if (remaining < (optional ? 0 : 1)) return null;
      return { score, dynamic }; // catch-all consumes the rest
    }
    if (ui >= urlSegs.length) return null;
    if (isDynamic(seg)) {
      dynamic = true;
    } else if (seg === urlSegs[ui]) {
      score += 1;
    } else {
      return null;
    }
    ri += 1;
    ui += 1;
  }
  if (ui !== urlSegs.length) return null; // url had leftover segments
  return { score, dynamic };
}

/** Preference order among route file kinds serving the same path. */
const ROUTE_KIND_RANK: Record<string, number> = {
  'next-page': 3,
  'next-route': 2,
  'next-layout': 1,
};

/** Map a browser URL path to the best Next.js route file in the index, or null. */
export function matchRouteFile(urlPath: string, nodes: CodeNode[]): RouteMatch | null {
  const urlSegs = normalizePathname(urlPath).split('/').filter(Boolean);
  let best: (RouteMatch & { _score: number; _rank: number }) | null = null;
  for (const n of nodes) {
    if (!n.route || ROUTE_KIND_RANK[n.kind] === undefined) continue;
    const routeSegs = n.route.split('/').filter(Boolean);
    const res = scoreRoute(routeSegs, urlSegs);
    if (!res) continue;
    const rank = ROUTE_KIND_RANK[n.kind] ?? 0;
    const candidate = {
      path: n.path,
      rel: n.rel,
      route: n.route,
      line: 1,
      column: 1,
      confidence: (res.dynamic ? 'medium' : 'high') as 'high' | 'medium',
      _score: res.score,
      _rank: rank,
    };
    if (
      !best ||
      candidate._score > best._score ||
      (candidate._score === best._score && candidate._rank > best._rank)
    ) {
      best = candidate;
    }
  }
  if (!best) return null;
  const { path, rel, route, line, column, confidence } = best;
  return { path, rel, route, line, column, confidence };
}

/** Find component exports matching `name` (exact), most-specific position first. */
export function matchComponents(name: string, nodes: CodeNode[]): ComponentMatch[] {
  if (!name) return [];
  const out: ComponentMatch[] = [];
  for (const n of nodes) {
    const detail = n.componentDetails?.find((c) => c.name === name);
    if (detail) {
      out.push({ path: n.path, rel: n.rel, name, line: detail.line, column: detail.column });
    } else if (n.components.includes(name)) {
      // Index built before positions were available — fall back to the file head.
      out.push({ path: n.path, rel: n.rel, name, line: 1, column: 1 });
    }
  }
  // Stable, readable ordering by relative path.
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Turn a source-file reference (from fiber `_debugSource` or `data-forge-source-file`) into an
 * openable absolute path, or null when it isn't a real on-disk file (e.g. a `webpack-internal://`
 * or `node_modules` path). Relative refs are resolved against the workspace root.
 */
export function resolveSourceFile(raw: string | undefined, root: string | null): string | null {
  if (!raw) return null;
  let file = raw;
  // Strip a Next.js/webpack query suffix like `page.tsx?12:5`.
  file = file.replace(/\?.*$/, '');
  if (/^(webpack|webpack-internal|node:|https?):/i.test(file)) return null;
  if (file.startsWith('file://')) {
    try {
      file = decodeURIComponent(new URL(file).pathname);
    } catch {
      return null;
    }
  }
  if (file.startsWith('/')) return file;
  if (root) return `${root}/${file.replace(/^\.\//, '')}`;
  return null;
}
