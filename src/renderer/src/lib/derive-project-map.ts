import type { DirEntry } from '@shared/ipc-contract';
import type { FolderCategory } from '../components/ModernFolderIcon';
import type { FilterChip } from '../stores/navigator-store';
import type { OpenFile } from '../stores/editor-store';
import type { MarkerInfo } from '../stores/workbench-status-store';

export interface DerivedEntry {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  changed: boolean;
  errors: boolean;
  recent: boolean;
  config: boolean;
  test: boolean;
}

export interface DerivedGroup {
  id: string;
  title: string;
  category: FolderCategory;
  entries: DerivedEntry[];
}

const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'eslint.config.mjs', '.npmrc', '.editorconfig', '.prettierrc.json', '.gitignore',
  'turbo.json', 'vite.config.ts', 'electron.vite.config.ts',
]);

const HIDDEN_NAMES = new Set(['node_modules', 'dist', 'out', 'build', '.next', 'coverage']);

interface Bucket {
  title: string;
  category: FolderCategory;
}

function classify(entry: DirEntry): string {
  const name = entry.name;
  const lower = name.toLowerCase();
  if (name.startsWith('.') || HIDDEN_NAMES.has(lower)) return 'hidden';
  if (entry.isDirectory) {
    if (['apps', 'app'].includes(lower)) return 'apps';
    if (['packages', 'libs'].includes(lower)) return 'packages';
    if (['services', 'src', 'server'].includes(lower)) return 'services';
    if (['scripts', 'ops', 'bin', 'tools'].includes(lower)) return 'scripts';
    if (['docs', 'documentation'].includes(lower)) return 'docs';
    return 'folders';
  }
  if (CONFIG_NAMES.has(lower) || /\.(json|ya?ml|toml|mjs|cjs)$/.test(lower) || /\.config\./.test(lower))
    return 'config';
  if (/\.(md|mdx)$/.test(lower)) return 'docs';
  return 'files';
}

const BUCKETS: Record<string, Bucket> = {
  apps: { title: 'Apps', category: 'apps' },
  packages: { title: 'Packages', category: 'packages' },
  services: { title: 'Services', category: 'services' },
  folders: { title: 'Folders', category: 'generic' },
  config: { title: 'Config', category: 'config' },
  docs: { title: 'Docs', category: 'docs' },
  scripts: { title: 'Scripts', category: 'scripts' },
  files: { title: 'Files', category: 'generic' },
  hidden: { title: 'Hidden / System', category: 'hidden' },
};

const ORDER = ['apps', 'packages', 'services', 'folders', 'files', 'config', 'docs', 'scripts', 'hidden'];

const isTestName = (n: string): boolean => /\.(test|spec)\./.test(n.toLowerCase());

export function deriveProjectMap(
  rootEntries: DirEntry[],
  openTabs: OpenFile[],
  markers: MarkerInfo[],
): DerivedGroup[] {
  const byKey: Record<string, DerivedEntry[]> = {};

  for (const entry of rootEntries) {
    const key = classify(entry);
    const seg = `/${entry.name}`;
    const changed = openTabs.some((t) => t.dirty && t.path.includes(seg));
    const recent = openTabs.some((t) => t.path.includes(seg));
    const errors = markers.some((m) => m.path.includes(seg));
    const derived: DerivedEntry = {
      id: entry.path,
      name: entry.name,
      path: entry.path,
      isFolder: entry.isDirectory,
      changed,
      recent,
      errors,
      config: key === 'config',
      test: isTestName(entry.name),
    };
    (byKey[key] ??= []).push(derived);
  }

  return ORDER.filter((k) => byKey[k]?.length).map((k) => ({
    id: k,
    title: BUCKETS[k].title,
    category: BUCKETS[k].category,
    entries: byKey[k],
  }));
}

export function entryMatchesFilter(entry: DerivedEntry, filter: FilterChip): boolean {
  switch (filter) {
    case 'all': return true;
    case 'changed': return entry.changed;
    case 'errors': return entry.errors;
    case 'recent': return entry.recent;
    case 'config': return entry.config;
    case 'tests': return entry.test;
  }
}
