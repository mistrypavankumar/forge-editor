export interface FuzzyResult {
  matched: boolean;
  score: number;
}

/** A fuzzy match that also reports which target indices were matched (for highlighting). */
export interface FuzzyMatch {
  matched: boolean;
  score: number;
  /** Indices into the target string that were matched, ascending. Empty when unmatched. */
  positions: number[];
}

/** A query matched against two fields (e.g. a file's name + path), with per-field highlights. */
export interface FieldMatch {
  matched: boolean;
  score: number;
  /** Matched indices in the primary field (name/title). */
  primary: number[];
  /** Matched indices in the secondary field (path/category). */
  secondary: number[];
}

// Matches in the primary field (a file's basename, a command's title) count for more than matches
// buried in the path/category, so "schema" ranks transfer-order-schema.ts above a file merely
// living under a schema/ folder — the way VS Code / fzf quick-open prefer basename hits.
const PRIMARY_WEIGHT = 2;

function isLower(ch: string): boolean {
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}
function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

/**
 * Greedy subsequence match of `query` against `target`, case-insensitive. Rewards contiguous runs,
 * a match at the very start, and matches on a word boundary — a separator (`-` `/` `.` `_` space)
 * or a camelCase hump (lower→Upper), so `tovl` scores well on `transfer-order-view-list` and `AE`
 * on `AppEditor`. Returns the matched indices so callers highlight exactly what ranked.
 */
export function fuzzyMatchPositions(query: string, target: string): FuzzyMatch {
  if (query.length === 0) return { matched: true, score: 0, positions: [] };
  const ql = query.toLowerCase();
  const tl = target.toLowerCase();
  const positions: number[] = [];
  let qi = 0;
  let score = 0;
  let prevMatchIndex = -2;
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) {
      positions.push(ti);
      score += 1;
      if (ti === prevMatchIndex + 1) score += 5; // contiguous run
      if (ti === 0) {
        score += 8; // start of string
      } else {
        const prev = target[ti - 1];
        if (prev === '-' || prev === '/' || prev === '.' || prev === '_' || prev === ' ') {
          score += 4; // separator boundary
        } else if (isLower(prev) && isUpper(target[ti])) {
          score += 4; // camelCase hump
        }
      }
      prevMatchIndex = ti;
      qi++;
    }
  }
  if (qi < ql.length) return { matched: false, score: 0, positions: [] };
  return { matched: true, score: score - target.length * 0.01, positions }; // mild shorter-target preference
}

/**
 * Match a whitespace-separated, order-independent query against a primary + secondary field. Each
 * term must match one of the fields (primary preferred, and weighted higher); the returned score is
 * the sum, and the highlight positions are grouped by field. Powers the command palette / quick-open
 * so `views equipment` finds a file by folder + name in either order while still favouring the name.
 */
export function fuzzyMatchFields(query: string, primary: string, secondary: string): FieldMatch {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { matched: true, score: 0, primary: [], secondary: [] };
  let score = 0;
  const primaryPos = new Set<number>();
  const secondaryPos = new Set<number>();
  for (const term of terms) {
    const inPrimary = fuzzyMatchPositions(term, primary);
    const inSecondary = fuzzyMatchPositions(term, secondary);
    // Prefer the primary field: take it whenever it matches, and weight it up so a name hit beats
    // the same term found deeper in the path. Fall back to the secondary field otherwise.
    if (inPrimary.matched && inPrimary.score * PRIMARY_WEIGHT >= inSecondary.score) {
      score += inPrimary.score * PRIMARY_WEIGHT;
      inPrimary.positions.forEach((p) => primaryPos.add(p));
    } else if (inSecondary.matched) {
      score += inSecondary.score;
      inSecondary.positions.forEach((p) => secondaryPos.add(p));
    } else if (inPrimary.matched) {
      score += inPrimary.score * PRIMARY_WEIGHT;
      inPrimary.positions.forEach((p) => primaryPos.add(p));
    } else {
      return { matched: false, score: 0, primary: [], secondary: [] };
    }
  }
  return {
    matched: true,
    score,
    primary: [...primaryPos].sort((a, b) => a - b),
    secondary: [...secondaryPos].sort((a, b) => a - b),
  };
}

/**
 * Match a whitespace-separated, order-independent query against a target: every term
 * must fuzzy-match somewhere in the target, and the score is the sum of per-term scores.
 * This lets a query like `business-objects equipment` find a file by folder + name in
 * either order — the way VS Code / fzf quick-open behaves.
 */
export function fuzzyMatchTerms(query: string, target: string): FuzzyResult {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { matched: true, score: 0 };
  let score = 0;
  for (const term of terms) {
    const r = fuzzyMatch(term, target);
    if (!r.matched) return { matched: false, score: 0 };
    score += r.score;
  }
  return { matched: true, score };
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  const r = fuzzyMatchPositions(query, target);
  return { matched: r.matched, score: r.score };
}
