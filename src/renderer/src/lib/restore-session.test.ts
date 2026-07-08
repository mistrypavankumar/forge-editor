import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreSession } from './workspace-actions';
import { useEditorStore, MAIN_GROUP, RIGHT_GROUP } from '../stores/editor-store';
import type { EditorSession, ForgeSettings } from '@shared/ipc-contract';

const FOLDER = '/repo';

function resetEditor(): void {
  useEditorStore.setState({
    tabs: [],
    groups: [{ id: MAIN_GROUP, paths: [], activePath: null }],
    activeGroupId: MAIN_GROUP,
    activePath: null,
  });
}

/** Mock window.forge with a given saved session and a set of files that exist on disk. */
function mockForge(session: EditorSession | undefined, existingFiles: Set<string>): void {
  (window as unknown as { forge: unknown }).forge = {
    loadSettings: vi.fn(async () => ({
      ok: true,
      data: (session ? { sessions: { [FOLDER]: session } } : {}) as ForgeSettings,
    })),
    readFile: vi.fn(async (p: string) =>
      existingFiles.has(p) ? { ok: true, data: `// ${p}` } : { ok: false, error: 'ENOENT' },
    ),
  };
}

beforeEach(resetEditor);

describe('restoreSession', () => {
  it('reopens saved tabs and restores the active one', async () => {
    const session: EditorSession = {
      groups: [{ id: MAIN_GROUP, paths: ['/repo/a.ts', '/repo/b.ts'], activePath: '/repo/b.ts' }],
      activeGroupId: MAIN_GROUP,
    };
    mockForge(session, new Set(['/repo/a.ts', '/repo/b.ts']));
    await restoreSession(FOLDER);
    const s = useEditorStore.getState();
    expect(s.tabs.map((t) => t.path)).toEqual(['/repo/a.ts', '/repo/b.ts']);
    expect(s.activePath).toBe('/repo/b.ts');
    expect(s.tabs[0].content).toBe('// /repo/a.ts');
  });

  it('restores a split layout across two columns', async () => {
    const session: EditorSession = {
      groups: [
        { id: MAIN_GROUP, paths: ['/repo/a.ts'], activePath: '/repo/a.ts' },
        { id: RIGHT_GROUP, paths: ['/repo/b.ts'], activePath: '/repo/b.ts' },
      ],
      activeGroupId: RIGHT_GROUP,
    };
    mockForge(session, new Set(['/repo/a.ts', '/repo/b.ts']));
    await restoreSession(FOLDER);
    const s = useEditorStore.getState();
    expect(s.groups.map((g) => g.id)).toEqual([MAIN_GROUP, RIGHT_GROUP]);
    expect(s.activeGroupId).toBe(RIGHT_GROUP);
    expect(s.activePath).toBe('/repo/b.ts');
  });

  it('drops files that no longer exist', async () => {
    const session: EditorSession = {
      groups: [{ id: MAIN_GROUP, paths: ['/repo/a.ts', '/repo/gone.ts'], activePath: '/repo/gone.ts' }],
      activeGroupId: MAIN_GROUP,
    };
    mockForge(session, new Set(['/repo/a.ts'])); // gone.ts missing
    await restoreSession(FOLDER);
    const s = useEditorStore.getState();
    expect(s.tabs.map((t) => t.path)).toEqual(['/repo/a.ts']);
    // Active fell through to the surviving file.
    expect(s.activePath).toBe('/repo/a.ts');
  });

  it('promotes the surviving column to main when the main column is fully gone', async () => {
    const session: EditorSession = {
      groups: [
        { id: MAIN_GROUP, paths: ['/repo/gone.ts'], activePath: '/repo/gone.ts' },
        { id: RIGHT_GROUP, paths: ['/repo/b.ts'], activePath: '/repo/b.ts' },
      ],
      activeGroupId: RIGHT_GROUP,
    };
    mockForge(session, new Set(['/repo/b.ts']));
    await restoreSession(FOLDER);
    const s = useEditorStore.getState();
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].id).toBe(MAIN_GROUP); // promoted
    expect(s.groups[0].paths).toEqual(['/repo/b.ts']);
  });

  it('does nothing when the editor already has real files open (mid-session folder switch)', async () => {
    useEditorStore.setState({
      tabs: [{ path: '/other/keep.ts', name: 'keep.ts', content: 'x', dirty: false }],
      groups: [{ id: MAIN_GROUP, paths: ['/other/keep.ts'], activePath: '/other/keep.ts' }],
      activeGroupId: MAIN_GROUP,
      activePath: '/other/keep.ts',
    });
    mockForge(
      { groups: [{ id: MAIN_GROUP, paths: ['/repo/a.ts'], activePath: '/repo/a.ts' }], activeGroupId: MAIN_GROUP },
      new Set(['/repo/a.ts']),
    );
    await restoreSession(FOLDER);
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/other/keep.ts']);
  });

  it('is a no-op when there is no saved session for the folder', async () => {
    mockForge(undefined, new Set());
    await restoreSession(FOLDER);
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });
});
