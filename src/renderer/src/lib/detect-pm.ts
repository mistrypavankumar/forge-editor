/** Detect the package manager from top-level lockfiles. */
export function detectPackageManager(names: string[]): string {
  const set = new Set(names);
  if (set.has('pnpm-lock.yaml')) return 'pnpm';
  if (set.has('yarn.lock')) return 'yarn';
  if (set.has('bun.lockb') || set.has('bun.lock')) return 'bun';
  if (set.has('package-lock.json')) return 'npm';
  return 'npm';
}
