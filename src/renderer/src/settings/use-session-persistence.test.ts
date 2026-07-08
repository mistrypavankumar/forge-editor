import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persist, snapshot } from './use-session-persistence';
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

/** Seed the editor with a set of tabs + a single main-group layout. */
function openTabs(tabs: { path: string; readOnly?: boolean; original?: string; kind?: 'file' | 'api-explorer' | 'codemap' }[]): void {
  const paths = tabs.map((t) => t.path);
  useEditorStore.setState({
    tabs: tabs.map((t) => ({ name: t.path.split('/').pop() ?? t.path, content: '', dirty: false, ...t })),
    groups: [{ id: MAIN_GROUP, paths, activePath: paths[paths.length - 1] ?? null }],
    activeGroupId: MAIN_GROUP,
    activePath: paths[paths.length - 1] ?? null,
  });
}

let saved: ForgeSettings | undefined;

beforeEach(() => {
  resetEditor();
  saved = undefined;
  (window as unknown as { forge: unknown }).forge = {
    loadSettings: vi.fn(async () => ({ ok: true, data: {} as ForgeSettings })),
    saveSettings: vi.fn(async (s: ForgeSettings) => {
      saved = s;
      return { ok: true, data: undefined };
    }),
  };
});

describe('snapshot', () => {
  it('keeps only real files inside the folder', () => {
    const tabs = [
      { path: '/repo/a.ts' },
      { path: '/repo/b.ts' },
      { path: 'api-explorer://request', kind: 'api-explorer' as const },
      { path: '/other/x.ts' }, // outside the folder
      { path: '/repo/diff.ts', original: 'old' }, // a diff view
      { path: '/repo/staged.ts', readOnly: true }, // read-only view
    ];
    useEditorStore.setState({
      tabs: tabs.map((t) => ({ name: t.path.split('/').pop() ?? t.path, content: '', dirty: false, ...t })),
      groups: [{ id: MAIN_GROUP, paths: tabs.map((t) => t.path), activePath: '/repo/b.ts' }],
      activeGroupId: MAIN_GROUP,
      activePath: '/repo/b.ts',
    });
    expect(snapshot(FOLDER).groups).toEqual([
      { id: MAIN_GROUP, paths: ['/repo/a.ts', '/repo/b.ts'], activePath: '/repo/b.ts' },
    ]);
  });

  it('nulls the active pointer when the active tab is a non-persistable view', () => {
    openTabs([{ path: '/repo/a.ts' }, { path: '/repo/diff.ts', original: 'old' }]);
    // openTabs made the trailing diff view active; it must not survive as activePath.
    expect(snapshot(FOLDER).groups).toEqual([
      { id: MAIN_GROUP, paths: ['/repo/a.ts'], activePath: null },
    ]);
  });

  it('drops a column that has no persistable files', () => {
    useEditorStore.setState({
      tabs: [
        { path: '/repo/a.ts', name: 'a.ts', content: '', dirty: false },
        { path: 'codemap://graph', name: 'Codebase Map', content: '', dirty: false, kind: 'codemap' },
      ],
      groups: [
        { id: MAIN_GROUP, paths: ['/repo/a.ts'], activePath: '/repo/a.ts' },
        { id: RIGHT_GROUP, paths: ['codemap://graph'], activePath: 'codemap://graph' },
      ],
      activeGroupId: MAIN_GROUP,
      activePath: '/repo/a.ts',
    });
    expect(snapshot(FOLDER).groups).toEqual([
      { id: MAIN_GROUP, paths: ['/repo/a.ts'], activePath: '/repo/a.ts' },
    ]);
  });
});

describe('persist', () => {
  it('writes this folder session while preserving other folders (no clobber)', async () => {
    const other: EditorSession = { groups: [{ id: MAIN_GROUP, paths: ['/proj/z.ts'], activePath: '/proj/z.ts' }], activeGroupId: MAIN_GROUP };
    (window.forge.loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { sessions: { '/proj': other } } as ForgeSettings,
    });
    openTabs([{ path: '/repo/a.ts' }]);
    await persist(FOLDER);
    expect(saved?.sessions?.['/proj']).toEqual(other); // untouched
    expect(saved?.sessions?.['/repo'].groups[0].paths).toEqual(['/repo/a.ts']);
  });

  it('removes the entry when the folder has no persistable tabs', async () => {
    (window.forge.loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { sessions: { '/repo': { groups: [{ id: MAIN_GROUP, paths: ['/repo/old.ts'], activePath: '/repo/old.ts' }], activeGroupId: MAIN_GROUP } } } as ForgeSettings,
    });
    openTabs([{ path: 'api-explorer://request', kind: 'api-explorer' }]); // nothing persistable
    await persist(FOLDER);
    expect(saved?.sessions?.['/repo']).toBeUndefined();
  });

  it('caps the number of remembered folders', async () => {
    const many: Record<string, EditorSession> = {};
    for (let i = 0; i < 45; i++) {
      many[`/f${i}`] = { groups: [{ id: MAIN_GROUP, paths: [`/f${i}/a.ts`], activePath: `/f${i}/a.ts` }], activeGroupId: MAIN_GROUP };
    }
    (window.forge.loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { sessions: many } as ForgeSettings,
    });
    openTabs([{ path: '/repo/a.ts' }]);
    await persist(FOLDER);
    expect(Object.keys(saved?.sessions ?? {}).length).toBeLessThanOrEqual(40);
    expect(saved?.sessions?.['/repo']).toBeDefined(); // the just-touched folder survives
  });
});
