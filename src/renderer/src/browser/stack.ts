import { resolveSourceFile, type SourceLocation } from './resolver';

/**
 * Parse browser error stack traces (Chrome/V8, Next.js dev, Vite dev) into frames, and map the
 * first frame that points at a workspace file to an openable source location. Pure functions of
 * their inputs; `resolveSourceFile` (from resolver.ts) does the final node_modules/synthetic-path
 * filtering and workspace-root resolution.
 */

export interface StackFrame {
  functionName?: string;
  /** File reference exactly as it appears in the stack (often a URL). */
  fileName: string;
  line?: number;
  column?: number;
}

/** Pull `file:line:col` off the tail of a location token (handles URLs with ports). */
function splitLocation(loc: string): { fileName: string; line?: number; column?: number } {
  const m = /^(.*?):(\d+):(\d+)$/.exec(loc) || /^(.*?):(\d+)$/.exec(loc);
  if (!m) return { fileName: loc };
  return {
    fileName: m[1],
    line: m[2] ? parseInt(m[2], 10) : undefined,
    column: m[3] ? parseInt(m[3], 10) : undefined,
  };
}

/**
 * Parse a stack trace string into frames. Recognizes the two dominant shapes:
 *   V8/Chrome:  `    at fnName (url:line:col)`  and  `    at url:line:col`
 *   Firefox/Safari/Vite:  `fnName@url:line:col`
 */
export function parseStackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // V8: "at fn (loc)" or "at loc"
    const at = /^at\s+(.*)$/.exec(line);
    if (at) {
      const body = at[1];
      const paren = /^(.*?)\s+\((.*)\)$/.exec(body);
      if (paren) {
        frames.push({ functionName: paren[1], ...splitLocation(paren[2]) });
      } else {
        frames.push(splitLocation(body));
      }
      continue;
    }

    // Firefox/Safari/Vite: "fn@loc" or "@loc"
    const atSign = line.indexOf('@');
    if (atSign >= 0 && /:\d+(:\d+)?$/.test(line)) {
      const fn = line.slice(0, atSign);
      frames.push({ functionName: fn || undefined, ...splitLocation(line.slice(atSign + 1)) });
    }
  }
  return frames;
}

/**
 * Normalize a stack-frame file reference to something `resolveSourceFile` can turn into a real
 * path: strip dev-server URL wrappers (`webpack-internal:`, `http://host/…`, Vite `?t=` queries,
 * `(app-pages-browser)` bundler segments) down to a workspace-relative or absolute path.
 * Returns undefined for frames that clearly aren't project source (compiled `_next` chunks, etc.).
 */
export function cleanFrameFile(fileName: string): string | undefined {
  let f = fileName.trim();
  if (!f) return undefined;

  // webpack-internal:///(app-pages-browser)/./src/x.tsx  →  src/x.tsx
  if (f.startsWith('webpack-internal:') || f.startsWith('webpack:')) {
    f = f.replace(/^[a-z-]+:\/{0,3}/i, '');
    f = f.replace(/^\([^)]*\)\//, ''); // drop a leading bundler group like (app-pages-browser)/
    f = f.replace(/^\.\//, '');
    return f.includes('node_modules') ? undefined : f;
  }

  if (/^https?:\/\//i.test(f)) {
    let pathname: string;
    try {
      const u = new URL(f);
      pathname = u.pathname;
    } catch {
      return undefined;
    }
    pathname = pathname.replace(/\?.*$/, '');
    // Vite exposes real files under /@fs/<abs> and /src/…; compiled Next chunks live under /_next.
    if (pathname.startsWith('/@fs/')) return pathname.slice('/@fs'.length);
    if (/\/_next\/|\/node_modules\//.test(pathname)) return undefined;
    return pathname.replace(/^\//, '');
  }

  return f;
}

/**
 * Resolve a captured error to an openable source location. Prefers the guest-parsed `source`
 * hint, then walks the stack for the first frame that maps to a workspace file. Returns null when
 * nothing resolves (caller falls back to route-file mapping).
 */
export function resolveErrorSource(
  stack: string | undefined,
  source: { fileName?: string; lineNumber?: number; columnNumber?: number } | undefined,
  root: string | null,
): SourceLocation | null {
  const tryFrame = (
    file: string | undefined,
    line?: number,
    column?: number,
  ): SourceLocation | null => {
    if (!file) return null;
    const path = resolveSourceFile(cleanFrameFile(file), root);
    return path ? { path, line: line ?? 1, column: column ?? 1 } : null;
  };

  const fromHint = tryFrame(source?.fileName, source?.lineNumber, source?.columnNumber);
  if (fromHint) return fromHint;

  for (const frame of parseStackFrames(stack)) {
    const hit = tryFrame(frame.fileName, frame.line, frame.column);
    if (hit) return hit;
  }
  return null;
}
