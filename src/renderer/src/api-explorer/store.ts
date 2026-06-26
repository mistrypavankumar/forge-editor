import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  ApiTemplate,
  AuthConfig,
  BodyMode,
  FormRow,
  HeaderRow,
  HistoryItem,
  HttpMethod,
  ParamRow,
} from './types';

import { DEFAULT_QUERY, DEFAULT_ENDPOINT, DEFAULT_VARIABLES } from './templates';

const MAX_HISTORY = 50;

const DEFAULT_AUTH: AuthConfig = { type: 'none', apiKeyIn: 'header' };

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
  /** Read-only blocks unsafe methods / mutations until explicitly disabled + confirmed. */
  readOnly: boolean;
  /** GraphQL document (used when `bodyMode === 'graphql'`). */
  query: string;
  /** GraphQL variables as a JSON string (used when `bodyMode === 'graphql'`). */
  variables: string;
  history: HistoryItem[];

  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setParams: (params: ParamRow[]) => void;
  setAuth: (auth: AuthConfig) => void;
  setHeaders: (headers: HeaderRow[]) => void;
  setBodyMode: (mode: BodyMode) => void;
  setBodyText: (text: string) => void;
  setFormRows: (rows: FormRow[]) => void;
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
      method: 'POST',
      url: DEFAULT_ENDPOINT,
      params: [],
      auth: DEFAULT_AUTH,
      headers: [],
      bodyMode: 'graphql',
      bodyText: '',
      formRows: [],
      readOnly: true,
      query: DEFAULT_QUERY,
      variables: DEFAULT_VARIABLES,
      history: [],

      setMethod: (method) => set({ method }),
      setUrl: (url) => set({ url }),
      setParams: (params) => set({ params }),
      setAuth: (auth) => set({ auth }),
      setHeaders: (headers) => set({ headers }),
      setBodyMode: (bodyMode) => set({ bodyMode }),
      setBodyText: (bodyText) => set({ bodyText }),
      setFormRows: (formRows) => set({ formRows }),
      setReadOnly: (readOnly) => set({ readOnly }),
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
    }),
    {
      name: 'forge:api-explorer',
      version: 2,
      // Persist everything EXCEPT in-memory secrets and transient UI state.
      partialize: (s) => ({
        method: s.method,
        url: s.url,
        params: s.params,
        // Drop secret auth fields; keep the type/shape so the editor reopens to the right mode.
        auth: { type: s.auth.type, apiKeyName: s.auth.apiKeyName, apiKeyIn: s.auth.apiKeyIn },
        headers: s.headers,
        bodyMode: s.bodyMode,
        bodyText: s.bodyText,
        formRows: s.formRows,
        readOnly: s.readOnly,
        query: s.query,
        variables: s.variables,
        history: s.history,
      }),
      // v1 stored `endpoint`; map it onto `url` so saved endpoints survive the upgrade.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2 && typeof state.endpoint === 'string' && !state.url) {
          state.url = state.endpoint;
        }
        return state as unknown as ApiExplorerState;
      },
    },
  ),
);
