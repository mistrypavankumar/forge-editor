export interface FuzzyResult {
  matched: boolean;
  score: number;
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
  if (query.length === 0) return { matched: true, score: 0 };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatchIndex = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (ti === prevMatchIndex + 1) score += 5; // contiguous bonus
      if (ti === 0) score += 8; // start bonus
      else if (t[ti - 1] === '-' || t[ti - 1] === '/' || t[ti - 1] === '.') score += 4; // boundary
      prevMatchIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return { matched: false, score: 0 };
  return { matched: true, score: score - t.length * 0.01 }; // mild shorter-target preference
}
