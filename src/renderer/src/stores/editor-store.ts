import { create } from 'zustand';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  /** Read-only tabs (e.g. a staged "(Index)" view) can't be edited or saved. */
  readOnly?: boolean;
  /** Real on-disk path backing the tab; differs from `path` for synthetic views. */
  filePath?: string;
  /** When set, the tab renders as a side-by-side diff: `original` (left) vs `content` (right). */
  original?: string;
  /**
   * Tab kind. Defaults to a normal file; `api-explorer` renders the API Explorer, `codemap` renders
   * the Codebase Map dependency graph, `browser` renders the embedded Browser + component inspector.
   */
  kind?: 'file' | 'api-explorer' | 'codemap' | 'browser';
}

/**
 * A view column. Groups reference open documents by path into the shared `tabs` list; the same
 * document can appear in more than one group (Split Right), sharing one buffer and dirty state.
 */
export interface EditorGroup {
  id: string;
  paths: string[];
  activePath: string | null;
}

export const MAIN_GROUP = 'main';
export const RIGHT_GROUP = 'right';

export interface RevealTarget {
  path: string;
  line: number;
  col: number;
  /** Optional end of the target range — when present, the symbol is briefly highlighted. */
  endLine?: number;
  endColumn?: number;
}

export interface EditorState {
  /** Open documents (content/dirty), shared across all groups, keyed by path. */
  tabs: OpenFile[];
  /** View layout: 1 group normally, 2 when split. */
  groups: EditorGroup[];
  activeGroupId: string;
  /** Mirror of the focused group's active path (kept for single-editor consumers). */
  activePath: string | null;
  reveal: RevealTarget | null;
  autoSave: boolean;
  /** Editor font size in px. */
  fontSize: number;
  pendingRevert: { path: string; content: string } | null;
  mdPreview: boolean;
  /** Paths of recently closed real files, most-recent last (for Reopen Closed Editor). */
  closedStack: string[];
  openFile: (file: {
    path: string;
    name: string;
    content: string;
    readOnly?: boolean;
    filePath?: string;
    original?: string;
    kind?: 'file' | 'api-explorer' | 'codemap' | 'browser';
  }) => void;
  closeFile: (path: string, groupId?: string) => void;
  setActive: (path: string, groupId?: string) => void;
  setActiveGroup: (groupId: string) => void;
  /** Open `path` (or the focused file) in a second group to the right, sharing the buffer. */
  splitRight: (path?: string) => void;
  /** Remove an editor group (no-op if it's the last one). */
  closeGroup: (groupId: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  requestReveal: (target: RevealTarget) => void;
  consumeReveal: () => void;
  setAutoSave: (on: boolean) => void;
  setFontSize: (size: number) => void;
  toggleMdPreview: () => void;
  requestRevert: (path: string, content: string) => void;
  consumeRevert: () => void;
  renameTab: (oldPath: string, newPath: string, name: string) => void;
  closeOthers: (path: string, groupId?: string) => void;
  closeToRight: (path: string, groupId?: string) => void;
  closeSaved: (groupId?: string) => void;
  closeAll: (groupId?: string) => void;
  /** Remove and return the most recently closed real-file path, or null. */
  takeClosed: () => string | null;
  /** Move the active tab by `delta` (wraps around) within the focused group. */
  cycleTab: (delta: number) => void;
}

const initialGroups = (): EditorGroup[] => [{ id: MAIN_GROUP, paths: [], activePath: null }];

function activeGroup(s: EditorState): EditorGroup {
  return s.groups.find((g) => g.id === s.activeGroupId) ?? s.groups[0];
}

/** Drop empty groups (keeping `main` so an empty editor still has a column). */
function pruneGroups(groups: EditorGroup[]): EditorGroup[] {
  const kept = groups.filter((g) => g.paths.length > 0 || g.id === MAIN_GROUP);
  return kept.length > 0 ? kept : initialGroups();
}

/**
 * Normalize derived state after a layout change: prune empty groups, drop orphan documents
 * (no group references them), keep `activeGroupId` valid, and refresh the `activePath` mirror.
 */
function commit(
  s: EditorState,
  patch: Partial<EditorState> & { groups: EditorGroup[] },
): Partial<EditorState> {
  const groups = pruneGroups(patch.groups);
  const referenced = new Set(groups.flatMap((g) => g.paths));
  const tabs = (patch.tabs ?? s.tabs).filter((t) => referenced.has(t.path));
  const activeGroupId = groups.some((g) => g.id === (patch.activeGroupId ?? s.activeGroupId))
    ? (patch.activeGroupId ?? s.activeGroupId)
    : groups[0].id;
  const focused = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  return { ...patch, groups, tabs, activeGroupId, activePath: focused.activePath };
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  groups: initialGroups(),
  activeGroupId: MAIN_GROUP,
  activePath: null,
  reveal: null,
  autoSave: false,
  fontSize: 13,
  pendingRevert: null,
  mdPreview: false,
  closedStack: [],

  openFile: (file) =>
    set((s) => {
      const g = activeGroup(s);
      const tabs = s.tabs.some((t) => t.path === file.path)
        ? s.tabs
        : [...s.tabs, { ...file, dirty: false }];
      const paths = g.paths.includes(file.path) ? g.paths : [...g.paths, file.path];
      const groups = s.groups.map((x) =>
        x.id === g.id ? { ...x, paths, activePath: file.path } : x,
      );
      return commit(s, { tabs, groups, activeGroupId: g.id });
    }),

  closeFile: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const g = s.groups.find((x) => x.id === gid);
      if (!g) return s;
      const idx = g.paths.indexOf(path);
      if (idx === -1) return s;
      const paths = g.paths.filter((p) => p !== path);
      const activePath =
        g.activePath === path ? (paths[idx] ?? paths[idx - 1] ?? null) : g.activePath;
      const groups = s.groups.map((x) => (x.id === gid ? { ...x, paths, activePath } : x));
      const stillOpen = groups.some((x) => x.paths.includes(path));
      const closedStack =
        !stillOpen && path.startsWith('/')
          ? [...s.closedStack.filter((p) => p !== path), path].slice(-20)
          : s.closedStack;
      return commit(s, { groups, closedStack });
    }),

  setActive: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const groups = s.groups.map((x) =>
        x.id === gid
          ? { ...x, activePath: path, paths: x.paths.includes(path) ? x.paths : [...x.paths, path] }
          : x,
      );
      return commit(s, { groups, activeGroupId: gid });
    }),

  setActiveGroup: (groupId) =>
    set((s) => (s.groups.some((g) => g.id === groupId) ? commit(s, { groups: s.groups, activeGroupId: groupId }) : s)),

  splitRight: (path) =>
    set((s) => {
      const src = activeGroup(s);
      const p = path ?? src.activePath;
      if (!p) return s;
      const existing = s.groups.find((g) => g.id !== MAIN_GROUP);
      if (existing) {
        const groups = s.groups.map((g) =>
          g.id === existing.id
            ? { ...g, paths: g.paths.includes(p) ? g.paths : [...g.paths, p], activePath: p }
            : g,
        );
        return commit(s, { groups, activeGroupId: existing.id });
      }
      const right: EditorGroup = { id: RIGHT_GROUP, paths: [p], activePath: p };
      return commit(s, { groups: [...s.groups, right], activeGroupId: RIGHT_GROUP });
    }),

  closeGroup: (groupId) =>
    set((s) => {
      if (s.groups.length <= 1) return s;
      const groups = s.groups.filter((g) => g.id !== groupId);
      return commit(s, { groups });
    }),

  updateContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, dirty: true } : t)),
    })),
  markSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: false } : t)),
    })),
  requestReveal: (target) => set({ reveal: target }),
  consumeReveal: () => set({ reveal: null }),
  setAutoSave: (on) => set({ autoSave: on }),
  setFontSize: (size) => set({ fontSize: Math.min(32, Math.max(8, Math.round(size))) }),
  toggleMdPreview: () => set((s) => ({ mdPreview: !s.mdPreview })),
  requestRevert: (path, content) => set({ pendingRevert: { path, content } }),
  consumeRevert: () => set({ pendingRevert: null }),

  renameTab: (oldPath, newPath, name) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === oldPath ? { ...t, path: newPath, name, dirty: false } : t,
      ),
      groups: s.groups.map((g) => ({
        ...g,
        paths: g.paths.map((p) => (p === oldPath ? newPath : p)),
        activePath: g.activePath === oldPath ? newPath : g.activePath,
      })),
      activePath: s.activePath === oldPath ? newPath : s.activePath,
    })),

  closeOthers: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const g = s.groups.find((x) => x.id === gid);
      if (!g || !g.paths.includes(path)) return s;
      const groups = s.groups.map((x) =>
        x.id === gid ? { ...x, paths: [path], activePath: path } : x,
      );
      return commit(s, { groups });
    }),

  closeToRight: (path, groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const g = s.groups.find((x) => x.id === gid);
      if (!g) return s;
      const idx = g.paths.indexOf(path);
      if (idx === -1) return s;
      const paths = g.paths.slice(0, idx + 1);
      const activePath = paths.includes(g.activePath ?? '') ? g.activePath : path;
      const groups = s.groups.map((x) => (x.id === gid ? { ...x, paths, activePath } : x));
      return commit(s, { groups });
    }),

  closeSaved: (groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const g = s.groups.find((x) => x.id === gid);
      if (!g) return s;
      const dirtyPaths = new Set(s.tabs.filter((t) => t.dirty).map((t) => t.path));
      const paths = g.paths.filter((p) => dirtyPaths.has(p));
      const activePath = paths.includes(g.activePath ?? '')
        ? g.activePath
        : (paths[paths.length - 1] ?? null);
      const groups = s.groups.map((x) => (x.id === gid ? { ...x, paths, activePath } : x));
      return commit(s, { groups });
    }),

  closeAll: (groupId) =>
    set((s) => {
      const gid = groupId ?? s.activeGroupId;
      const groups = s.groups.map((x) =>
        x.id === gid ? { ...x, paths: [], activePath: null } : x,
      );
      return commit(s, { groups });
    }),

  takeClosed: () => {
    let popped: string | null = null;
    set((s) => {
      if (s.closedStack.length === 0) return s;
      const closedStack = [...s.closedStack];
      popped = closedStack.pop() ?? null;
      return { closedStack };
    });
    return popped;
  },

  cycleTab: (delta) =>
    set((s) => {
      const g = activeGroup(s);
      if (g.paths.length === 0) return s;
      const idx = g.paths.indexOf(g.activePath ?? '');
      const next = (idx + delta + g.paths.length) % g.paths.length;
      const groups = s.groups.map((x) =>
        x.id === g.id ? { ...x, activePath: g.paths[next] } : x,
      );
      return commit(s, { groups });
    }),
}));
