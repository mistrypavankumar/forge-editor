// Line-level diff between a file's committed (HEAD) content and its current
// buffer, used to drive the editor's git change gutter. Indices on the result
// are 0-based, half-open ranges into the *current* document's line array.

export interface DiffHunk {
  type: 'add' | 'del' | 'mod';
  /** First current-line index covered by the hunk (0-based). */
  modStart: number;
  /** One past the last current-line index (0-based, half-open). For 'del' this equals modStart. */
  modEnd: number;
  /** First original (HEAD) line index this hunk replaced (0-based). */
  origStart: number;
  /** The original (HEAD) lines this hunk replaced — used to restore on revert. */
  origLines: string[];
}

interface MidHunk {
  type: 'add' | 'del' | 'mod';
  oStart: number;
  oEnd: number;
  mStart: number;
  mEnd: number;
}

// Beyond this many differing lines on a side we skip the O(n*m) LCS pass and
// emit one coarse hunk — keeps large rewrites from stalling the editor.
const CAP = 2000;

function classify(dels: number, ins: number): 'add' | 'del' | 'mod' {
  if (dels && ins) return 'mod';
  return dels ? 'del' : 'add';
}

/** LCS-based grouping of the trimmed middle sections into change hunks. */
function diffMiddle(a: string[], b: string[]): MidHunk[] {
  const n = a.length;
  const m = b.length;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }

  const hunks: MidHunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    const oStart = i;
    const mStart = j;
    let dels = 0;
    let ins = 0;
    // Consume a contiguous run of edits using the same step rule as backtracking.
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) break;
      if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
        i++;
        dels++;
      } else {
        j++;
        ins++;
      }
    }
    hunks.push({ type: classify(dels, ins), oStart, oEnd: oStart + dels, mStart, mEnd: mStart + ins });
  }
  return hunks;
}

export function computeDiff(orig: string[], mod: string[]): DiffHunk[] {
  let prefix = 0;
  const maxPre = Math.min(orig.length, mod.length);
  while (prefix < maxPre && orig[prefix] === mod[prefix]) prefix++;

  let suffix = 0;
  while (suffix < maxPre - prefix && orig[orig.length - 1 - suffix] === mod[mod.length - 1 - suffix]) {
    suffix++;
  }

  const oMid = orig.slice(prefix, orig.length - suffix);
  const mMid = mod.slice(prefix, mod.length - suffix);
  if (oMid.length === 0 && mMid.length === 0) return [];

  const mids: MidHunk[] =
    oMid.length > CAP || mMid.length > CAP
      ? [{ type: classify(oMid.length, mMid.length), oStart: 0, oEnd: oMid.length, mStart: 0, mEnd: mMid.length }]
      : diffMiddle(oMid, mMid);

  return mids.map((h) => ({
    type: h.type,
    modStart: prefix + h.mStart,
    modEnd: prefix + h.mEnd,
    origStart: prefix + h.oStart,
    origLines: oMid.slice(h.oStart, h.oEnd),
  }));
}
