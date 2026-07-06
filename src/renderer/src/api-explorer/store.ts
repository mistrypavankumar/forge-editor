import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  ApiTemplate,
  AuthConfig,
  BodyMode,
  Collection,
  FormRow,
  HeaderRow,
  HistoryItem,
  HttpMethod,
  ParamRow,
  SavedRequest,
} from './types';

import { DEFAULT_QUERY, DEFAULT_ENDPOINT, DEFAULT_VARIABLES } from './templates';

const MAX_HISTORY = 50;

/** Left-sidebar tab. */
export type SidebarTab = 'collections' | 'history' | 'schema';
/** Request-section tab. */
export type RequestTab = 'params' | 'auth' | 'headers' | 'body';

const DEFAULT_AUTH: AuthConfig = { type: 'none', apiKeyIn: 'header' };

let seq = 0;
const nextId = (prefix: string): string => {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
};

/** Fields of a saved request, taken from the live editor state (secrets dropped). */
type RequestSnapshot = Omit<SavedRequest, 'id' | 'name' | 'updatedAt'>;

function snapshotRequest(s: ApiExplorerState): RequestSnapshot {
  return {
    method: s.method,
    url: s.url,
    params: s.params,
    auth: { type: s.auth.type, apiKeyName: s.auth.apiKeyName, apiKeyIn: s.auth.apiKeyIn },
    headers: s.headers,
    bodyMode: s.bodyMode,
    bodyText: s.bodyText,
    formRows: s.formRows,
    query: s.query,
    variables: s.variables,
  };
}

/** Cheap structural equality for two request snapshots (keys are produced in a stable order). */
function sameSnapshot(a: RequestSnapshot, b: RequestSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether the live editor state diverges from the saved request it was loaded from. False when no
 * request is active. Secret-only edits (tokens, passwords) don't count — they're not snapshotted.
 */
export function selectActiveRequestDirty(s: ApiExplorerState): boolean {
  if (!s.activeRequestId) return false;
  const saved = s.collections.flatMap((c) => c.requests).find((r) => r.id === s.activeRequestId);
  if (!saved) return false;
  return !sameSnapshot(snapshotRequest(s), snapshotRequest(saved as unknown as ApiExplorerState));
}

function applyRequest(r: SavedRequest): Partial<ApiExplorerState> {
  return {
    method: r.method,
    url: r.url,
    params: r.params,
    auth: { ...DEFAULT_AUTH, ...r.auth },
    headers: r.headers,
    bodyMode: r.bodyMode,
    bodyText: r.bodyText,
    formRows: r.formRows,
    query: r.query,
    variables: r.variables,
  };
}

export interface ApiExplorerState {
  method: HttpMethod;
  /** Full request URL, including any query string (kept in sync with `params`). */
  url: string;
  /** Query-param rows, two-way synced with the URL. */
  params: ParamRow[];
  /** Authorization config — secret fields are never persisted (see `partialize`). */
  auth: AuthConfig;
  headers: HeaderRow[];
  bodyMode: BodyMode;
  /** Raw body text for json/text/xml modes. */
  bodyText: string;
  /** Field rows for form-data / x-www-form-urlencoded modes. */
  formRows: FormRow[];
  /** GraphQL document (used when `bodyMode === 'graphql'`). */
  query: string;
  /** GraphQL variables as a JSON string (used when `bodyMode === 'graphql'`). */
  variables: string;
  history: HistoryItem[];
  /** Most-recently-used request URLs (most recent first), for the URL bar suggestions. */
  recentUrls: string[];
  /** Saved request collections (Postman-style). */
  collections: Collection[];
  /** Id of the saved request currently loaded into the editor, if any. */
  activeRequestId: string | null;

  /** Fraction (0–1) of the main column height given to the request section (rest is the response). */
  requestPaneRatio: number;
  /** Height in px of the GraphQL variables editor. */
  variablesHeight: number;
  /** Selected left-sidebar tab (Collections / History / Schema). */
  sidebarTab: SidebarTab;
  /** Selected request tab (Params / Auth / Headers / Body). */
  requestTab: RequestTab;

  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setParams: (params: ParamRow[]) => void;
  setAuth: (auth: AuthConfig) => void;
  setHeaders: (headers: HeaderRow[]) => void;
  setBodyMode: (mode: BodyMode) => void;
  setBodyText: (text: string) => void;
  setFormRows: (rows: FormRow[]) => void;
  setQuery: (query: string) => void;
  setVariables: (variables: string) => void;
  loadTemplate: (template: ApiTemplate) => void;
  loadHistory: (item: HistoryItem) => void;
  loadOperation: (query: string, variables: string) => void;
  addHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  /** Record a URL as recently used (deduped, most recent first). */
  recordUrl: (url: string) => void;
  removeRecentUrl: (url: string) => void;

  // Collections.
  createCollection: (name: string) => string;
  renameCollection: (id: string, name: string) => void;
  removeCollection: (id: string) => void;
  toggleCollection: (id: string) => void;
  /** Snapshot the current request into a collection as a new saved request; returns its id. */
  saveRequest: (collectionId: string, name: string) => string;
  /** Add a fresh blank request to a collection, load it into the editor; returns its id. */
  createRequest: (collectionId: string, name: string) => string;
  /** Re-snapshot the current request onto the saved request that's currently loaded. */
  updateActiveRequest: () => void;
  /** Load a saved request into the editor and mark it active. */
  loadSavedRequest: (id: string) => void;
  renameRequest: (id: string, name: string) => void;
  removeRequest: (id: string) => void;
  duplicateRequest: (id: string) => void;

  setRequestPaneRatio: (ratio: number) => void;
  setVariablesHeight: (height: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setRequestTab: (tab: RequestTab) => void;
}

export const useApiExplorerStore = create<ApiExplorerState>()(
  persist(
    (set, get) => ({
      method: 'GET',
      url: DEFAULT_ENDPOINT,
      params: [],
      auth: DEFAULT_AUTH,
      headers: [],
      bodyMode: 'none',
      bodyText: '',
      formRows: [],
      query: DEFAULT_QUERY,
      variables: DEFAULT_VARIABLES,
      history: [],
      recentUrls: [],
      collections: [],
      activeRequestId: null,
      requestPaneRatio: 0.5,
      variablesHeight: 120,
      sidebarTab: 'collections',
      requestTab: 'body',

      setMethod: (method) => set({ method }),
      setUrl: (url) => set({ url }),
      setParams: (params) => set({ params }),
      setAuth: (auth) => set({ auth }),
      setHeaders: (headers) => set({ headers }),
      setBodyMode: (bodyMode) => set({ bodyMode }),
      setBodyText: (bodyText) => set({ bodyText }),
      setFormRows: (formRows) => set({ formRows }),
      setQuery: (query) => set({ query }),
      setVariables: (variables) => set({ variables }),
      loadTemplate: (template) =>
        set({ query: template.query, variables: template.variables, bodyMode: 'graphql' }),
      loadHistory: (item) =>
        set({
          method: item.method,
          url: item.url,
          bodyMode: item.bodyMode,
          query: item.query,
          variables: item.variables,
          bodyText: item.bodyText,
        }),
      loadOperation: (query, variables) => set({ query, variables, bodyMode: 'graphql' }),
      addHistory: (item) =>
        set((s) => {
          seq += 1;
          const entry: HistoryItem = {
            ...item,
            id: `aeh-${Date.now()}-${seq}`,
            timestamp: Date.now(),
          };
          return { history: [entry, ...s.history].slice(0, MAX_HISTORY) };
        }),
      removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),
      recordUrl: (url) =>
        set((s) => {
          const trimmed = url.trim();
          if (!trimmed) return s;
          return {
            recentUrls: [trimmed, ...s.recentUrls.filter((u) => u !== trimmed)].slice(0, MAX_HISTORY),
          };
        }),
      removeRecentUrl: (url) =>
        set((s) => ({ recentUrls: s.recentUrls.filter((u) => u !== url) })),

      createCollection: (name) => {
        const id = nextId('aec');
        set((s) => ({
          collections: [
            ...s.collections,
            { id, name: name.trim() || 'New Collection', requests: [] },
          ],
        }));
        return id;
      },
      renameCollection: (id, name) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, name: name.trim() || c.name } : c,
          ),
        })),
      removeCollection: (id) =>
        set((s) => {
          const removed = s.collections.find((c) => c.id === id);
          const hadActive = removed?.requests.some((r) => r.id === s.activeRequestId);
          return {
            collections: s.collections.filter((c) => c.id !== id),
            activeRequestId: hadActive ? null : s.activeRequestId,
          };
        }),
      toggleCollection: (id) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, collapsed: !c.collapsed } : c,
          ),
        })),
      saveRequest: (collectionId, name) => {
        const id = nextId('aer');
        const req: SavedRequest = {
          ...snapshotRequest(get()),
          id,
          name: name.trim() || 'Untitled request',
          updatedAt: Date.now(),
        };
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, requests: [...c.requests, req] } : c,
          ),
          activeRequestId: id,
        }));
        return id;
      },
      createRequest: (collectionId, name) => {
        const id = nextId('aer');
        const req: SavedRequest = {
          id,
          name: name.trim() || 'Untitled request',
          method: 'GET',
          url: DEFAULT_ENDPOINT,
          params: [],
          auth: { ...DEFAULT_AUTH },
          headers: [],
          bodyMode: 'none',
          bodyText: '',
          formRows: [],
          query: DEFAULT_QUERY,
          variables: DEFAULT_VARIABLES,
          updatedAt: Date.now(),
        };
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, collapsed: false, requests: [...c.requests, req] }
              : c,
          ),
          ...applyRequest(req),
          activeRequestId: id,
        }));
        return id;
      },
      updateActiveRequest: () => {
        const { activeRequestId } = get();
        if (!activeRequestId) return;
        const snap = snapshotRequest(get());
        const saved = get()
          .collections.flatMap((c) => c.requests)
          .find((r) => r.id === activeRequestId);
        // Nothing changed (e.g. autosave firing right after a load) — skip the updatedAt churn.
        if (saved && sameSnapshot(snap, snapshotRequest(saved as unknown as ApiExplorerState))) return;
        set((s) => ({
          collections: s.collections.map((c) => ({
            ...c,
            requests: c.requests.map((r) =>
              r.id === activeRequestId ? { ...r, ...snap, updatedAt: Date.now() } : r,
            ),
          })),
        }));
      },
      loadSavedRequest: (id) => {
        const saved = get()
          .collections.flatMap((c) => c.requests)
          .find((r) => r.id === id);
        if (!saved) return;
        set({ ...applyRequest(saved), activeRequestId: id });
      },
      renameRequest: (id, name) =>
        set((s) => ({
          collections: s.collections.map((c) => ({
            ...c,
            requests: c.requests.map((r) =>
              r.id === id ? { ...r, name: name.trim() || r.name } : r,
            ),
          })),
        })),
      removeRequest: (id) =>
        set((s) => ({
          collections: s.collections.map((c) => ({
            ...c,
            requests: c.requests.filter((r) => r.id !== id),
          })),
          activeRequestId: s.activeRequestId === id ? null : s.activeRequestId,
        })),
      duplicateRequest: (id) =>
        set((s) => ({
          collections: s.collections.map((c) => {
            const idx = c.requests.findIndex((r) => r.id === id);
            if (idx === -1) return c;
            const src = c.requests[idx];
            const copy: SavedRequest = {
              ...src,
              id: nextId('aer'),
              name: `${src.name} copy`,
              updatedAt: Date.now(),
            };
            const requests = [...c.requests];
            requests.splice(idx + 1, 0, copy);
            return { ...c, requests };
          }),
        })),

      setRequestPaneRatio: (ratio) =>
        set({ requestPaneRatio: Math.max(0.15, Math.min(0.85, ratio)) }),
      setVariablesHeight: (height) => set({ variablesHeight: Math.max(60, Math.min(600, height)) }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setRequestTab: (requestTab) => set({ requestTab }),
    }),
    {
      name: 'forge:api-explorer',
      version: 4,
      // Persist everything EXCEPT in-memory secrets and transient UI state.
      partialize: (s) => ({
        method: s.method,
        url: s.url,
        params: s.params,
        // Drop secret auth fields; keep the type/shape so the editor reopens to the right mode.
        auth: {
          type: s.auth.type,
          apiKeyName: s.auth.apiKeyName,
          apiKeyIn: s.auth.apiKeyIn,
        } as AuthConfig,
        headers: s.headers,
        bodyMode: s.bodyMode,
        bodyText: s.bodyText,
        formRows: s.formRows,
        query: s.query,
        variables: s.variables,
        history: s.history,
        recentUrls: s.recentUrls,
        collections: s.collections,
        activeRequestId: s.activeRequestId,
        requestPaneRatio: s.requestPaneRatio,
        variablesHeight: s.variablesHeight,
        sidebarTab: s.sidebarTab,
        requestTab: s.requestTab,
      }),
      // v1 stored `endpoint`; map it onto `url` so saved endpoints survive the upgrade.
      // v2→v3 made the explorer REST-first: drop the old GraphQL-default method/bodyMode so
      // they fall back to the new defaults (GET / none). URL, query text, headers, and history
      // are kept untouched.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2 && typeof state.endpoint === 'string' && !state.url) {
          state.url = state.endpoint;
        }
        if (version < 3) {
          delete state.method;
          delete state.bodyMode;
        }
        return state as unknown as ApiExplorerState;
      },
    },
  ),
);
