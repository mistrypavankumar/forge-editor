import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ApiTemplate, HeaderRow, HistoryItem } from './types';

import { DEFAULT_QUERY, DEFAULT_ENDPOINT, DEFAULT_VARIABLES } from './templates';

const MAX_HISTORY = 50;

export interface ApiExplorerState {
  endpoint: string;
  /** Bearer token — kept in memory only, never persisted (see `partialize`). */
  token: string;
  headers: HeaderRow[];
  /** Read-only blocks mutations until explicitly disabled + confirmed. */
  readOnly: boolean;
  query: string;
  variables: string;
  history: HistoryItem[];

  setEndpoint: (endpoint: string) => void;
  setToken: (token: string) => void;
  setHeaders: (headers: HeaderRow[]) => void;
  setReadOnly: (readOnly: boolean) => void;
  setQuery: (query: string) => void;
  setVariables: (variables: string) => void;
  loadTemplate: (template: ApiTemplate) => void;
  loadHistory: (item: HistoryItem) => void;
  loadOperation: (query: string, variables: string) => void;
  addHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
}

let seq = 0;

export const useApiExplorerStore = create<ApiExplorerState>()(
  persist(
    (set) => ({
      endpoint: DEFAULT_ENDPOINT,
      token: '',
      headers: [],
      readOnly: true,
      query: DEFAULT_QUERY,
      variables: DEFAULT_VARIABLES,
      history: [],

      setEndpoint: (endpoint) => set({ endpoint }),
      setToken: (token) => set({ token }),
      setHeaders: (headers) => set({ headers }),
      setReadOnly: (readOnly) => set({ readOnly }),
      setQuery: (query) => set({ query }),
      setVariables: (variables) => set({ variables }),
      loadTemplate: (template) => set({ query: template.query, variables: template.variables }),
      loadHistory: (item) => set({ query: item.query, variables: item.variables }),
      loadOperation: (query, variables) => set({ query, variables }),
      addHistory: (item) =>
        set((s) => {
          seq += 1;
          const entry: HistoryItem = { ...item, id: `aeh-${Date.now()}-${seq}`, timestamp: Date.now() };
          return { history: [entry, ...s.history].slice(0, MAX_HISTORY) };
        }),
      removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'forge:api-explorer',
      // Persist everything EXCEPT the in-memory bearer token and any transient UI state.
      partialize: (s) => ({
        endpoint: s.endpoint,
        headers: s.headers,
        readOnly: s.readOnly,
        query: s.query,
        variables: s.variables,
        history: s.history,
      }),
    },
  ),
);
