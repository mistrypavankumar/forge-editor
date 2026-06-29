import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  TraceMap,
  originalPositionFor,
  generatedPositionFor,
  GREATEST_LOWER_BOUND,
  LEAST_UPPER_BOUND,
} from '@jridgewell/trace-mapping';

/** A generated location in V8/CDP coordinates (line/column both 0-based). */
export interface GeneratedLocation {
  /** `file://` URL of the generated script (what `Debugger.setBreakpointByUrl` expects). */
  url: string;
  lineNumber: number;
  columnNumber: number;
}

/** An authored location in editor coordinates (1-based line, 1-based column). */
export interface AuthoredLocation {
  file: string;
  line: number;
  column: number;
}

interface ScriptEntry {
  scriptId: string;
  url: string;
  /** Filesystem path of the generated script, when its url is a `file://`. */
  filePath: string | null;
  /** Source map for the script, or null when it has none (plain JS / type-stripping). */
  tracer: TraceMap | null;
  /** Raw source strings in the map, keyed by their resolved absolute path. */
  authoredByPath: Map<string, string>;
  /** Resolved absolute path per raw source string (reverse of `authoredByPath`). */
  pathByAuthored: Map<string, string>;
}

function decodeInlineSourceMap(sourceMapURL: string): unknown | null {
  const comma = sourceMapURL.indexOf(',');
  if (!sourceMapURL.startsWith('data:') || comma === -1) return null;
  const meta = sourceMapURL.slice(5, comma);
  const payload = sourceMapURL.slice(comma + 1);
  try {
    const json = meta.includes('base64')
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function urlToPath(url: string): string | null {
  if (!url.startsWith('file://')) return null;
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

/**
 * Tracks the source maps of every script V8 parses during a debug session, so breakpoints set on
 * an authored `.ts` line bind to the right generated line and paused locations map back to the
 * source the user actually wrote. Scripts without a map (plain JS, or TypeScript run via Node's
 * line-preserving `--experimental-strip-types`) fall through to an identity mapping.
 */
export class SourceMapRegistry {
  private readonly byScriptId = new Map<string, ScriptEntry>();
  /** Authored absolute path -> scriptIds whose map covers it (for re-binding breakpoints on parse). */
  private readonly scriptsByAuthored = new Map<string, Set<string>>();

  register(scriptId: string, url: string, sourceMapURL: string | undefined): void {
    const filePath = urlToPath(url);
    const entry: ScriptEntry = {
      scriptId,
      url,
      filePath,
      tracer: null,
      authoredByPath: new Map(),
      pathByAuthored: new Map(),
    };

    const rawMap = sourceMapURL ? decodeInlineSourceMap(sourceMapURL) : null;
    if (rawMap) {
      try {
        const tracer = new TraceMap(rawMap as ConstructorParameters<typeof TraceMap>[0], url);
        entry.tracer = tracer;
        const sources = tracer.sources;
        const resolved = tracer.resolvedSources;
        for (let i = 0; i < sources.length; i++) {
          const raw = sources[i];
          if (raw == null) continue;
          const abs = resolved[i] ? urlToPath(resolved[i] as string) : null;
          const path = abs ?? raw;
          entry.authoredByPath.set(path, raw);
          entry.pathByAuthored.set(raw, path);
          let set = this.scriptsByAuthored.get(path);
          if (!set) this.scriptsByAuthored.set(path, (set = new Set()));
          set.add(scriptId);
        }
      } catch {
        entry.tracer = null;
      }
    }

    this.byScriptId.set(scriptId, entry);
    // No map: the generated file IS the authored file (identity). Index it so breakpoints bind.
    if (!entry.tracer && filePath) {
      let set = this.scriptsByAuthored.get(filePath);
      if (!set) this.scriptsByAuthored.set(filePath, (set = new Set()));
      set.add(scriptId);
    }
  }

  clear(): void {
    this.byScriptId.clear();
    this.scriptsByAuthored.clear();
  }

  /** Script ids already parsed whose code maps the given authored file (for breakpoint re-binding). */
  scriptsForAuthored(file: string): string[] {
    return [...(this.scriptsByAuthored.get(file) ?? [])];
  }

  /**
   * Map an authored editor line (1-based) to a generated location for `Debugger.setBreakpointByUrl`.
   * Returns one candidate per script that maps the file; empty when no parsed script covers it yet
   * (the caller then sets an identity breakpoint on the file URL, which Node binds on parse).
   */
  authoredToGenerated(file: string, line: number): GeneratedLocation[] {
    const out: GeneratedLocation[] = [];
    for (const scriptId of this.scriptsByAuthored.get(file) ?? []) {
      const entry = this.byScriptId.get(scriptId);
      if (!entry) continue;
      if (!entry.tracer) {
        // Identity mapping — authored line == generated line.
        out.push({ url: entry.url, lineNumber: line - 1, columnNumber: 0 });
        continue;
      }
      const source = entry.authoredByPath.get(file);
      if (source == null) continue;
      // Bias toward the first generated position at or after the requested line so a breakpoint on a
      // blank/comment line slides down to the next real statement (what users expect).
      const gen =
        generatedPositionFor(entry.tracer, { source, line, column: 0, bias: LEAST_UPPER_BOUND }) ??
        generatedPositionFor(entry.tracer, { source, line, column: 0, bias: GREATEST_LOWER_BOUND });
      if (gen && gen.line != null) {
        out.push({ url: entry.url, lineNumber: gen.line - 1, columnNumber: gen.column ?? 0 });
      }
    }
    return out;
  }

  /**
   * Map a paused CDP location (0-based line/column) back to the authored source. Falls back to the
   * script's own file for un-mapped scripts; returns null for scripts with no file URL (native code).
   */
  generatedToAuthored(scriptId: string, lineNumber: number, columnNumber: number): AuthoredLocation | null {
    const entry = this.byScriptId.get(scriptId);
    if (!entry) return null;
    if (!entry.tracer) {
      if (!entry.filePath) return null;
      return { file: entry.filePath, line: lineNumber + 1, column: columnNumber + 1 };
    }
    const pos = originalPositionFor(entry.tracer, {
      line: lineNumber + 1,
      column: columnNumber,
      bias: GREATEST_LOWER_BOUND,
    });
    if (!pos || pos.source == null || pos.line == null) {
      return entry.filePath ? { file: entry.filePath, line: lineNumber + 1, column: columnNumber + 1 } : null;
    }
    const abs = entry.pathByAuthored.get(pos.source) ?? urlToPath(pos.source) ?? pos.source;
    return { file: abs, line: pos.line, column: (pos.column ?? 0) + 1 };
  }
}

/** Convert an absolute filesystem path to a `file://` URL string (for `setBreakpointByUrl`). */
export function pathToUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}
