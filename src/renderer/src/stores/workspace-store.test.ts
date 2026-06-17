import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from './workspace-store';

const reset = () =>
  useWorkspaceStore.setState({
    rootPath: null,
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: {},
  });

describe('workspace-store', () => {
  beforeEach(reset);

  it('setWorkspace stores root path and entries', () => {
    useWorkspaceStore.getState().setWorkspace('/proj', [
      { name: 'src', path: '/proj/src', isDirectory: true },
    ]);
    const s = useWorkspaceStore.getState();
    expect(s.rootPath).toBe('/proj');
    expect(s.rootEntries).toHaveLength(1);
  });

  it('setChildren caches a directory\'s children', () => {
    useWorkspaceStore.getState().setChildren('/proj/src', [
      { name: 'a.ts', path: '/proj/src/a.ts', isDirectory: false },
    ]);
    expect(useWorkspaceStore.getState().childrenByPath['/proj/src']).toHaveLength(1);
  });

  it('toggleExpanded flips a directory open and closed', () => {
    useWorkspaceStore.getState().toggleExpanded('/proj/src');
    expect(useWorkspaceStore.getState().expandedPaths['/proj/src']).toBe(true);
    useWorkspaceStore.getState().toggleExpanded('/proj/src');
    expect(useWorkspaceStore.getState().expandedPaths['/proj/src']).toBe(false);
  });
});
