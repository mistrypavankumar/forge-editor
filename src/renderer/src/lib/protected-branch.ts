/**
 * Branches that shouldn't be committed to directly — work belongs on a feature branch and lands
 * via PR. The commit button is disabled on these branches.
 */
const PROTECTED_BRANCHES = new Set([
  'main',
  'master',
  'dev',
  'develop',
  'development',
  'staging',
  'release',
  'production',
  'prod',
]);

/** True if `branch` is a protected branch (case-insensitive). */
export function isProtectedBranch(branch: string | null | undefined): boolean {
  return branch != null && PROTECTED_BRANCHES.has(branch.toLowerCase());
}
