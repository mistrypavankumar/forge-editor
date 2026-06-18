import { describe, it, expect } from 'vitest';
import type { DirEntry } from '@shared/ipc-contract';
import { deriveProjectMap, isExpandableContainer } from './derive-project-map';

const dir = (name: string, path = `/repo/${name}`): DirEntry => ({
  name,
  path,
  isDirectory: true,
});
const file = (name: string, path = `/repo/${name}`): DirEntry => ({
  name,
  path,
  isDirectory: false,
});

describe('isExpandableContainer', () => {
  it('is true for apps/packages directories', () => {
    expect(isExpandableContainer(dir('apps'))).toBe(true);
    expect(isExpandableContainer(dir('packages'))).toBe(true);
    expect(isExpandableContainer(dir('libs'))).toBe(true);
  });

  it('is false for other directories and files', () => {
    expect(isExpandableContainer(dir('docs'))).toBe(false);
    expect(isExpandableContainer(file('apps'))).toBe(false);
  });
});

describe('deriveProjectMap container flattening', () => {
  const root = [dir('apps'), dir('packages')];

  it('lists the container folder itself when children are not loaded', () => {
    const groups = deriveProjectMap(root, [], [], {});
    const apps = groups.find((g) => g.id === 'apps');
    expect(apps?.entries.map((e) => e.name)).toEqual(['apps']);
  });

  it('flattens the children of apps/packages into their groups', () => {
    const childrenByPath: Record<string, DirEntry[]> = {
      '/repo/apps': [dir('scm', '/repo/apps/scm'), dir('supplier', '/repo/apps/supplier')],
      '/repo/packages': [dir('ui', '/repo/packages/ui'), file('README.md', '/repo/packages/README.md')],
    };
    const groups = deriveProjectMap(root, [], [], childrenByPath);

    const apps = groups.find((g) => g.id === 'apps');
    expect(apps?.entries.map((e) => e.name)).toEqual(['scm', 'supplier']);

    const packages = groups.find((g) => g.id === 'packages');
    expect(packages?.entries.map((e) => e.name)).toEqual(['ui', 'README.md']);
    expect(packages?.entries.find((e) => e.name === 'README.md')?.isFolder).toBe(false);
  });

  it('skips node_modules and other hidden children inside containers', () => {
    const childrenByPath: Record<string, DirEntry[]> = {
      '/repo/apps': [
        dir('scm', '/repo/apps/scm'),
        dir('node_modules', '/repo/apps/node_modules'),
        dir('dist', '/repo/apps/dist'),
      ],
    };
    const groups = deriveProjectMap([dir('apps')], [], [], childrenByPath);
    const apps = groups.find((g) => g.id === 'apps');
    expect(apps?.entries.map((e) => e.name)).toEqual(['scm']);
  });
});
