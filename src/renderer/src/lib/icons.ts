import { addCollection } from '@iconify/react';
import vscodeIcons from '@iconify-json/vscode-icons/icons.json';
import type { FolderCategory } from '../components/ModernFolderIcon';

// Register the icon set once, offline (no network/CDN).
addCollection(vscodeIcons as Parameters<typeof addCollection>[0]);

const PREFIX = 'vscode-icons:';

const EXACT: Record<string, string> = {
  'package.json': 'file-type-npm',
  'package-lock.json': 'file-type-npm',
  'pnpm-lock.yaml': 'file-type-pnpm',
  'pnpm-workspace.yaml': 'file-type-pnpm',
  'tsconfig.json': 'file-type-tsconfig',
  'turbo.json': 'file-type-turbo',
  '.npmrc': 'file-type-npm',
  '.editorconfig': 'file-type-editorconfig',
  '.gitignore': 'file-type-git',
  '.gitattributes': 'file-type-git',
  '.prettierignore': 'file-type-prettier',
  '.prettierrc.json': 'file-type-prettier',
  makefile: 'file-type-text',
  license: 'file-type-license',
  'readme.md': 'file-type-markdown',
};

const EXT: Record<string, string> = {
  ts: 'file-type-typescript',
  tsx: 'file-type-reactts',
  js: 'file-type-js',
  mjs: 'file-type-js',
  cjs: 'file-type-js',
  jsx: 'file-type-reactjs',
  json: 'file-type-json',
  md: 'file-type-markdown',
  mdx: 'file-type-markdown',
  yml: 'file-type-yaml',
  yaml: 'file-type-yaml',
  sql: 'file-type-sql',
  graphql: 'file-type-graphql',
  gql: 'file-type-graphql',
  sh: 'file-type-shell',
  bash: 'file-type-shell',
  css: 'file-type-css',
  scss: 'file-type-scss',
  html: 'file-type-html',
  java: 'file-type-java',
  txt: 'file-type-text',
};

export function fileIconId(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith('.env')) return `${PREFIX}file-type-dotenv`;
  if (lower in EXACT) return `${PREFIX}${EXACT[lower]}`;
  if (lower.startsWith('.eslintrc') || lower.includes('eslint.config'))
    return `${PREFIX}file-type-eslint`;
  if (lower.includes('.prettierrc')) return `${PREFIX}file-type-prettier`;
  if (lower.includes('vite.config')) return `${PREFIX}file-type-vite`;
  if (lower.startsWith('tsconfig')) return `${PREFIX}file-type-tsconfig`;
  if (lower.endsWith('.d.ts')) return `${PREFIX}file-type-typescriptdef`;
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return `${PREFIX}${EXT[ext] ?? 'default-file'}`;
}

const CATEGORY_FOLDER: Record<FolderCategory, string> = {
  apps: 'folder-type-app',
  packages: 'folder-type-package',
  services: 'folder-type-server',
  config: 'folder-type-config',
  docs: 'folder-type-docs',
  scripts: 'folder-type-tools',
  hidden: 'default-folder',
  generic: 'default-folder',
};

function folderByName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (['apps', 'app'].includes(lower)) return 'folder-type-app';
  if (['packages', 'libs'].includes(lower)) return 'folder-type-package';
  if (lower === 'src') return 'folder-type-src';
  if (['services', 'server'].includes(lower)) return 'folder-type-server';
  if (['components', 'component'].includes(lower)) return 'folder-type-component';
  if (lower === 'config') return 'folder-type-config';
  if (['docs', 'documentation'].includes(lower)) return 'folder-type-docs';
  if (['scripts', 'ops', 'bin', 'tools'].includes(lower)) return 'folder-type-tools';
  if (lower === 'node_modules') return 'folder-type-node';
  if (lower === '.git') return 'folder-type-git';
  if (['dist', 'out', 'build'].includes(lower)) return 'folder-type-dist';
  return undefined;
}

interface FolderIconArgs {
  name?: string;
  category?: FolderCategory;
  open?: boolean;
}

export function folderIconId({ name, category, open = false }: FolderIconArgs): string {
  let base = name ? folderByName(name) : undefined;
  if (!base && category) base = CATEGORY_FOLDER[category];
  if (!base) base = 'default-folder';
  // Prefer the opened variant when available; vscode-icons names append "-opened".
  return `${PREFIX}${open ? `${base}-opened` : base}`;
}
