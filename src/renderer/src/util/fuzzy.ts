export function fuzzyMatch(query: string, target: string): { matched: boolean; score: number } {
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
