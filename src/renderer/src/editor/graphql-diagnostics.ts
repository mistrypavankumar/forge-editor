import { parse, print, visit, Kind, type DocumentNode, type GraphQLError } from 'graphql';
import type * as monacoNs from 'monaco-editor';
import type { editor } from 'monaco-editor';

/**
 * GraphQL diagnostics for `gql` / `graphql` tagged template literals embedded in TS/JS files. The
 * main-process TypeScript Language Service doesn't look inside template strings, so GraphQL mistakes
 * (duplicate fields, syntax errors) go unreported. This runs in the renderer with the graphql-js
 * parser (already bundled for the API Explorer) and paints markers under its own owner, so it layers
 * cleanly on top of the TS markers rather than replacing them.
 *
 * Duplicate *scalar* fields are legal GraphQL (they merge on execution), so `validate()` never flags
 * them — but they're almost always a copy-paste bug. We detect them the way `graphql-eslint`'s
 * duplicate-field rule does: two sibling selections that print identically are a duplicate.
 */

/** Marker owner for GraphQL-in-template diagnostics — kept separate from the TS LS owner. */
export const GRAPHQL_MARKER_OWNER = 'forge-graphql';

export interface GqlTemplate {
  /** Offset (in the host file) of the first character inside the backticks. */
  start: number;
  /** Offset (in the host file) of the closing backtick. */
  end: number;
  /** The raw template body (may contain `${…}` interpolations). */
  text: string;
  hasInterpolation: boolean;
}

export type GqlSeverity = 'error' | 'warning';

/** A problem located by host-file character offsets (so it's testable without a Monaco model). */
export interface GqlProblem {
  start: number;
  end: number;
  message: string;
  severity: GqlSeverity;
}

/**
 * Find `gql`/`graphql` tagged template literals in source, returning each body and its offsets.
 * Hand-scans for the closing backtick while tracking `${…}` interpolation nesting so a backtick
 * inside an interpolation doesn't end the literal early. Escaped characters are skipped.
 */
export function extractGqlTemplates(src: string): GqlTemplate[] {
  const out: GqlTemplate[] = [];
  // A `gql` / `graphql` tag immediately before a backtick, not part of a longer identifier.
  const tag = /(?<![\w$.])(?:gql|graphql)\s*`/g;
  while (tag.exec(src) !== null) {
    const bodyStart = tag.lastIndex; // char after the opening backtick
    let i = bodyStart;
    let depth = 0; // >0 while inside a ${ … } interpolation
    let hasInterpolation = false;
    let end = -1;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (depth > 0) {
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        hasInterpolation = true;
        depth = 1;
        i += 2;
        continue;
      }
      if (c === '`') {
        end = i;
        break;
      }
      i++;
    }
    if (end === -1) break; // unterminated template — stop scanning
    out.push({ start: bodyStart, end, text: src.slice(bodyStart, end), hasInterpolation });
    tag.lastIndex = end + 1;
  }
  return out;
}

/**
 * Replace every `${…}` interpolation with equal-length whitespace (newlines preserved) so the body
 * can be handed to the GraphQL parser without shifting any offsets. A trailing `${Fragment}` (the
 * common Apollo pattern that injects a fragment definition) blanks to whitespace and still parses;
 * an in-selection `...${X}` blanks to an invalid spread — those templates simply fail to parse and
 * are skipped, so no false diagnostics are produced for interpolated documents.
 */
export function blankInterpolations(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      for (let k = i; k < j; k++) out += text[k] === '\n' ? '\n' : ' ';
      i = j;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** Report sibling field selections that print identically (true duplicates) in each selection set. */
function collectDuplicateFields(doc: DocumentNode, base: number, out: GqlProblem[]): void {
  visit(doc, {
    SelectionSet(node) {
      const seen = new Set<string>();
      for (const sel of node.selections) {
        if (sel.kind !== Kind.FIELD) continue;
        const signature = print(sel);
        if (seen.has(signature)) {
          const nameNode = sel.alias ?? sel.name;
          const loc = nameNode.loc ?? sel.loc;
          if (loc) {
            out.push({
              start: base + loc.start,
              end: base + loc.end,
              message: `Duplicate field "${nameNode.value}" — identical to an earlier field in this selection set.`,
              severity: 'warning',
            });
          }
        } else {
          seen.add(signature);
        }
      }
    },
  });
}

/**
 * Compute GraphQL problems for every `gql` template in `src`, located by host-file offsets. Parses
 * each body (blanking interpolations first) and reports duplicate fields; genuine syntax errors are
 * reported only for interpolation-free templates, where a parse failure is unambiguous.
 */
export function computeGraphqlProblems(src: string): GqlProblem[] {
  if (!src.includes('gql') && !src.includes('graphql')) return [];
  const out: GqlProblem[] = [];
  for (const tpl of extractGqlTemplates(src)) {
    const source = tpl.hasInterpolation ? blankInterpolations(tpl.text) : tpl.text;
    if (!source.trim()) continue; // empty / all-interpolation body — nothing to validate
    let doc: DocumentNode;
    try {
      doc = parse(source);
    } catch (e) {
      if (!tpl.hasInterpolation) {
        const err = e as GraphQLError;
        const pos = err.positions?.[0];
        if (pos != null) {
          out.push({
            start: tpl.start + pos,
            end: tpl.start + Math.min(source.length, pos + 1),
            message: err.message,
            severity: 'error',
          });
        }
      }
      continue;
    }
    collectDuplicateFields(doc, tpl.start, out);
  }
  return out;
}

/** Compute GraphQL diagnostics for a model and paint them as markers (TS/JS models only). */
export function refreshGraphqlDiagnostics(
  monaco: typeof monacoNs,
  model: editor.ITextModel,
): void {
  if (model.isDisposed()) return;
  const id = model.getLanguageId();
  if (id !== 'typescript' && id !== 'javascript') return;

  const problems = computeGraphqlProblems(model.getValue());
  monaco.editor.setModelMarkers(
    model,
    GRAPHQL_MARKER_OWNER,
    problems.map((p) => {
      const start = model.getPositionAt(p.start);
      const end = model.getPositionAt(p.end);
      return {
        severity:
          p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: p.message,
        source: 'graphql',
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    }),
  );
}
