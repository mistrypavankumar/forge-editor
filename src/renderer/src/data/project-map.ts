import type { FolderCategory } from '../components/ModernFolderIcon';

export type BadgeKind = 'changed' | 'issue' | 'clean' | 'count';

export interface MapEntry {
  id: string;
  name: string;
  desc?: string;
  badge?: { kind: BadgeKind; label: string };
  isFolder?: boolean;
  // filter flags
  changed?: boolean;
  errors?: boolean;
  recent?: boolean;
  config?: boolean;
  test?: boolean;
}

export interface MapGroup {
  id: string;
  title: string;
  description: string;
  category: FolderCategory;
  collapsedByDefault?: boolean;
  entries: MapEntry[];
}

export const projectMap: MapGroup[] = [
  {
    id: 'workspace',
    title: 'Workspace',
    description: 'Monorepo root',
    category: 'generic',
    entries: [
      { id: 'w1', name: 'daxwell', desc: 'pnpm · turbo monorepo', badge: { kind: 'count', label: '6 pkgs' }, isFolder: true },
    ],
  },
  {
    id: 'apps',
    title: 'Apps',
    description: 'Frontend applications',
    category: 'apps',
    entries: [
      { id: 'a1', name: 'scm', desc: 'Next.js app', badge: { kind: 'changed', label: '4 changed' }, isFolder: true, changed: true, recent: true },
      { id: 'a2', name: 'supplier', desc: 'Next.js portal', badge: { kind: 'issue', label: '1 issue' }, isFolder: true, errors: true },
      { id: 'a3', name: 'admin', desc: 'Dashboard', badge: { kind: 'clean', label: 'clean' }, isFolder: true },
    ],
  },
  {
    id: 'packages',
    title: 'Packages',
    description: 'Shared libraries',
    category: 'packages',
    entries: [
      { id: 'p1', name: 'ui', desc: 'Component library', isFolder: true, changed: true },
      { id: 'p2', name: 'core', desc: 'Business logic', isFolder: true },
      { id: 'p3', name: 'graphql', desc: 'Apollo client + types', isFolder: true },
      { id: 'p4', name: 'shared', desc: 'Cross-app utils', isFolder: true },
    ],
  },
  {
    id: 'services',
    title: 'Services',
    description: 'Data & domain layer',
    category: 'services',
    entries: [
      { id: 's1', name: 'user-service.ts', desc: 'src/services · modified', badge: { kind: 'issue', label: '1 issue' }, changed: true, errors: true, recent: true },
      { id: 's2', name: 'permissions.service.ts', desc: 'src/services', changed: true },
      { id: 's3', name: 'carrier-rate.service.ts', desc: 'src/services' },
    ],
  },
  {
    id: 'config',
    title: 'Config',
    description: 'Project configuration',
    category: 'config',
    entries: [
      { id: 'c1', name: 'package.json', desc: 'workspace root', config: true },
      { id: 'c2', name: 'pnpm-workspace.yaml', desc: 'package globs', config: true },
      { id: 'c3', name: 'eslint.config.mjs', desc: 'lint rules', config: true },
      { id: 'c4', name: 'tsconfig.json', desc: 'compiler options', config: true },
      { id: 'c5', name: '.env.local', desc: 'local secrets', config: true },
    ],
  },
  {
    id: 'scripts',
    title: 'Scripts',
    description: 'Automation & ops',
    category: 'scripts',
    entries: [
      { id: 'sc1', name: 'scripts', desc: 'codegen · release', isFolder: true },
      { id: 'sc2', name: 'ops', desc: 'deploy · infra', isFolder: true },
    ],
  },
  {
    id: 'docs',
    title: 'Docs',
    description: 'Documentation',
    category: 'docs',
    entries: [
      { id: 'd1', name: 'docs', desc: 'architecture · guides', isFolder: true },
      { id: 'd2', name: 'README.md', desc: 'getting started', recent: true },
    ],
  },
  {
    id: 'hidden',
    title: 'Hidden / System',
    description: 'Generated & tooling',
    category: 'hidden',
    collapsedByDefault: true,
    entries: [
      { id: 'h1', name: 'node_modules', desc: 'dependencies', isFolder: true },
      { id: 'h2', name: '.git', desc: 'version control', isFolder: true },
      { id: 'h3', name: '.turbo', desc: 'build cache', isFolder: true },
      { id: 'h4', name: '.trunk', desc: 'tooling', isFolder: true },
    ],
  },
];

export type FilterChip = 'all' | 'changed' | 'errors' | 'recent' | 'config' | 'tests';

export const filterChips: { id: FilterChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'changed', label: 'Changed' },
  { id: 'errors', label: 'Errors' },
  { id: 'recent', label: 'Recent' },
  { id: 'config', label: 'Config' },
  { id: 'tests', label: 'Tests' },
];

export function entryMatchesFilter(entry: MapEntry, filter: FilterChip): boolean {
  switch (filter) {
    case 'all': return true;
    case 'changed': return Boolean(entry.changed);
    case 'errors': return Boolean(entry.errors);
    case 'recent': return Boolean(entry.recent);
    case 'config': return Boolean(entry.config);
    case 'tests': return Boolean(entry.test);
  }
}
