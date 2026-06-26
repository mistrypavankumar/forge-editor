/**
 * Types for the API Explorer — a Postman-style GraphQL playground embedded in Forge.
 * Unlike the host app's session-backed clients, Forge is a generic editor: the user
 * supplies the endpoint, an optional bearer token, and any custom headers.
 */

export type OperationType = 'query' | 'mutation' | 'subscription';

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

/** A custom request header row (Authorization is handled separately as `token`). */
export interface HeaderRow {
  id: string;
  key: string;
  value: string;
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
  data?: unknown;
  errors?: GraphQLError[];
  networkError?: string;
  raw: string;
  startedAt: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  operationName: string;
  operationType: OperationType;
  endpoint: string;
}

/** A persisted, replayable record of one executed operation (never stores tokens). */
export interface HistoryItem {
  id: string;
  operationName: string;
  operationType: OperationType;
  status: 'success' | 'error';
  durationMs: number;
  timestamp: number;
  httpStatus: number | null;
  query: string;
  variables: string;
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
