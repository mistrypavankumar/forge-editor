import type { ExecutionResult, OperationType } from './types';

import { byteLength, extractGraphqlErrors, detectOperationType } from './graphql-utils';

export interface RunArgs {
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  operationName: string;
  /** Bearer token (sent as `Authorization: Bearer <token>`), if provided. */
  token?: string;
  /** Extra custom headers, merged onto the request. */
  headers?: Record<string, string>;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Execute a GraphQL operation against `endpoint`. The HTTP request runs in the main process
 * (via `window.forge.graphqlRequest`) so there's no renderer CORS. Never throws — transport
 * failures come back as `networkError`; a 200 carrying `errors[]` is reported as not-ok.
 */
export async function runGraphQL(args: RunArgs): Promise<ExecutionResult> {
  const { endpoint, query, variables, operationName, token, headers } = args;

  const bodyObject: Record<string, unknown> = { query };
  if (variables !== undefined) bodyObject.variables = variables;
  if (operationName) bodyObject.operationName = operationName;
  const body = JSON.stringify(bodyObject);

  const requestHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (token && token.trim()) requestHeaders.Authorization = `Bearer ${token.trim()}`;

  const operationType: OperationType = detectOperationType(query) ?? 'query';
  const startedAt = Date.now();
  const startPerf = now();

  const result = await window.forge.graphqlRequest({ url: endpoint, headers: requestHeaders, body });

  const durationMs = Math.round(now() - startPerf);

  if (!result.ok) {
    return {
      ok: false,
      httpStatus: null,
      httpStatusText: '',
      networkError: result.error,
      raw: '',
      startedAt,
      durationMs,
      requestSize: byteLength(body),
      responseSize: 0,
      operationName,
      operationType,
      endpoint,
    };
  }

  const { status, statusText, body: raw } = result.data;
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined; // non-JSON body (e.g. an HTML error page) — surfaced via `raw`.
  }

  const errors = extractGraphqlErrors(parsed);
  const data =
    parsed && typeof parsed === 'object' ? (parsed as { data?: unknown }).data : undefined;
  const ok = status >= 200 && status < 300 && !errors;

  return {
    ok,
    httpStatus: status,
    httpStatusText: statusText,
    data,
    errors,
    raw,
    startedAt,
    durationMs,
    requestSize: byteLength(body),
    responseSize: byteLength(raw),
    operationName,
    operationType,
    endpoint,
  };
}
