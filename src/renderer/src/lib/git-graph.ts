import type { GitCommit } from '@shared/ipc-contract';

/** Lane colours, cycled by column index. Tuned to read well on the dark surface. */
export const GRAPH_PALETTE = [
  '#E8923C', // orange
  '#5B8CFF', // blue
  '#8B73FF', // purple (accent)
  '#3DDC97', // green
  '#FF5C7A', // pink
  '#4DD0E1', // cyan
  '#F7B955', // amber
  '#A48BFF', // light purple
];

export function laneColor(col: number): string {
  return GRAPH_PALETTE[((col % GRAPH_PALETTE.length) + GRAPH_PALETTE.length) % GRAPH_PALETTE.length];
}

export interface GraphEdge {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  color: string;
  /** True for a merge parent (2nd+): the line branches off near the child, not the parent. */
  merge: boolean;
}

export interface GitGraph {
  /** Column (lane) assigned to each commit, indexed by row. */
  cols: number[];
  /** Edges from a commit to each of its in-window parents. */
  edges: GraphEdge[];
  /** Total number of lanes used (graph width in columns). */
  lanes: number;
}

/**
 * Assign each commit to a lane and compute the edges to its parents — the classic
 * git-graph layout. Commits arrive newest-first (as `git log` emits them). Each lane
 * tracks the hash it is next waiting to reach; a commit takes the lane that expects it
 * (or a fresh one for a branch tip), its first parent inherits that lane, and extra
 * (merge) parents open new lanes.
 */
export function computeGitGraph(commits: GitCommit[]): GitGraph {
  const rowOf = new Map<string, number>();
  commits.forEach((c, i) => rowOf.set(c.hash, i));

  const cols: number[] = new Array(commits.length);
  const lanes: (string | null)[] = []; // lanes[l] = hash that lane l is waiting to reach

  const firstFree = (): number => {
    const i = lanes.indexOf(null);
    if (i !== -1) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];

    let myLane = lanes.indexOf(c.hash);
    if (myLane === -1) myLane = firstFree(); // a branch tip nothing was waiting for
    cols[i] = myLane;

    // Children merging here collapse: free every other lane that also expected this commit.
    for (let l = 0; l < lanes.length; l++) if (lanes[l] === c.hash) lanes[l] = null;

    if (c.parents.length > 0) {
      // First parent continues straight down in this lane.
      lanes[myLane] = c.parents[0];
      // Additional parents (a merge) each need a lane, unless one already expects them.
      for (let p = 1; p < c.parents.length; p++) {
        if (lanes.indexOf(c.parents[p]) === -1) lanes[firstFree()] = c.parents[p];
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
  }

  let lanesUsed = 0;
  for (const col of cols) lanesUsed = Math.max(lanesUsed, col + 1);

  const edges: GraphEdge[] = [];
  for (let i = 0; i < commits.length; i++) {
    const fromCol = cols[i];
    commits[i].parents.forEach((ph, pi) => {
      const toRow = rowOf.get(ph);
      if (toRow === undefined) return; // parent is older than the loaded window
      const toCol = cols[toRow];
      // First-parent edges keep the child's colour; a merged-in branch keeps its own lane colour.
      edges.push({
        fromRow: i,
        fromCol,
        toRow,
        toCol,
        color: laneColor(pi === 0 ? fromCol : toCol),
        merge: pi !== 0,
      });
    });
  }

  return { cols, edges, lanes: lanesUsed };
}

/**
 * SVG path for one edge, given the absolute endpoint coordinates. Coordinates are passed in
 * (rather than derived from row index) so rows can have non-uniform heights — e.g. when a commit
 * is expanded to show its files and the rows below it shift down. `r` is the curve radius.
 */
export function edgePath(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  merge: boolean,
  r: number,
): string {
  if (fx === tx) return `M ${fx} ${fy} L ${tx} ${ty}`;
  if (merge) {
    // Merge: branch diverges from the child near the top, then runs straight down its lane.
    return `M ${fx} ${fy} C ${fx} ${fy + r / 2} ${tx} ${fy + r / 2} ${tx} ${fy + r} L ${tx} ${ty}`;
  }
  // Branch base: runs straight down its lane, then curves into the parent's lane near the bottom.
  return `M ${fx} ${fy} L ${fx} ${ty - r} C ${fx} ${ty - r / 2} ${tx} ${ty - r / 2} ${tx} ${ty}`;
}
