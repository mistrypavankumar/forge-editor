/**
 * Types for the API Explorer — a Postman-style GraphQL playground embedded in Forge.
 * Unlike the host app's session-backed clients, Forge is a generic editor: the user
 * supplies the endpoint, an optional bearer token, and any custom headers.
 */

export type OperationType = 'query' | 'mutation' | 'subscription';

/** HTTP verbs the explorer can issue. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Methods that may change server state — guarded by read-only / a confirm prompt. */
export const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

/** How the request body is composed. `graphql` preserves the original query/variables flow. */
export type BodyMode = 'none' | 'json' | 'text' | 'xml' | 'form' | 'urlencoded' | 'graphql';

/** Authorization strategy applied to the outgoing request. */
export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  /** Bearer token (secret — never persisted). */
  token?: string;
  /** Basic auth username. */
  username?: string;
  /** Basic auth password (secret — never persisted). */
  password?: string;
  /** API-key name (header name or query param name). */
  apiKeyName?: string;
  /** API-key value (secret — never persisted). */
  apiKeyValue?: string;
  /** Whether the API key is sent as a header or a query param. */
  apiKeyIn?: 'header' | 'query';
}

/** A predefined, ready-to-run example shown in the sidebar. */
export interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  query: string;
  /** Variables as a pretty-printed JSON string. */
  variables: string;
}

/** A custom request header row (Authorization is handled separately via `AuthConfig`). */
export interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

/** A query-param row, kept in two-way sync with the URL's query string. */
export interface ParamRow {
  id: string;
  key: string;
  value: string;
  /** Disabled rows are excluded from the request but kept in the editor. */
  enabled?: boolean;
}

/** A form field row for `multipart/form-data` or `x-www-form-urlencoded` bodies. */
export interface FormRow {
  id: string;
  key: string;
  value: string;
  enabled?: boolean;
}

export interface GraphQLError {
  message: string;
  path?: ReadonlyArray<string | number>;
  locations?: ReadonlyArray<{ line: number; column: number }>;
  extensions?: Record<string, unknown>;
}

/** Outcome of one execution, with timing + size metadata. */
export interface ExecutionResult {
  ok: boolean;
  httpStatus: number | null;
  httpStatusText: string;
  /** Parsed JSON payload when the body is JSON (GraphQL: the `data` field). */
  data?: unknown;
  /** GraphQL errors (only populated in graphql body mode). */
  errors?: GraphQLError[];
  networkError?: string;
  raw: string;
  /** Response headers (lowercased keys). */
  responseHeaders: Record<string, string>;
  startedAt: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  /** HTTP method issued. */
  method: HttpMethod;
  /** Final request URL (after params/auth were applied). */
  url: string;
  /** GraphQL operation name (empty for REST). */
  operationName: string;
  /** GraphQL operation type (only meaningful in graphql mode). */
  operationType?: OperationType;
}

/** A persisted, replayable record of one executed request (never stores secrets). */
export interface HistoryItem {
  id: string;
  /** Display label: the GraphQL operation name, or the request path for REST. */
  label: string;
  method: HttpMethod;
  url: string;
  bodyMode: BodyMode;
  status: 'success' | 'error';
  durationMs: number;
  timestamp: number;
  httpStatus: number | null;
  /** Snapshot of the request needed to replay it. */
  query: string;
  variables: string;
  bodyText: string;
  responseSummary: string;
}

/** One argument / nested input-object field in the schema browser tree. */
export interface SchemaArgNode {
  name: string;
  typeString: string;
  required: boolean;
  children?: SchemaArgNode[];
}

/** A root operation (query or mutation) flattened for the schema browser. */
export interface SchemaField {
  name: string;
  typeString: string;
  description?: string;
  args: SchemaArgNode[];
}

export interface SchemaOperations {
  queries: SchemaField[];
  mutations: SchemaField[];
}
