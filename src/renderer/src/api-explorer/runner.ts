import type {
  AuthConfig,
  BodyMode,
  ExecutionResult,
  FormRow,
  HttpMethod,
  OperationType,
} from './types';

import { byteLength, extractGraphqlErrors, detectOperationType } from './graphql-utils';

export interface RunArgs {
  method: HttpMethod;
  /** Full request URL including any query string (params already merged in). */
  url: string;
  auth: AuthConfig;
  /** Custom request headers (from the Headers tab). */
  headers: Record<string, string>;
  bodyMode: BodyMode;
  /** Raw body for json/text/xml modes. */
  bodyText: string;
  /** Field rows for form/urlencoded modes. */
  formRows: FormRow[];
  // GraphQL mode:
  query: string;
  variables?: Record<string, unknown>;
  operationName: string;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}

/** Apply the auth config onto the headers (mutated) and return the possibly-extended URL. */
function applyAuth(url: string, auth: AuthConfig, headers: Record<string, string>): string {
  switch (auth.type) {
    case 'bearer':
      if (auth.token?.trim()) headers.Authorization = `Bearer ${auth.token.trim()}`;
      return url;
    case 'basic': {
      const user = auth.username ?? '';
      const pass = auth.password ?? '';
      if (user || pass) headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
      return url;
    }
    case 'apikey': {
      const name = auth.apiKeyName?.trim();
      const value = auth.apiKeyValue ?? '';
      if (!name) return url;
      if (auth.apiKeyIn === 'query') {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
      }
      headers[name] = value;
      return url;
    }
    default:
      return url;
  }
}

const enabledRows = (rows: FormRow[]): FormRow[] =>
  rows.filter((r) => (r.enabled ?? true) && r.key.trim());

/** Build the request body + the content-type it implies (or null to leave content-type alone). */
function buildBody(args: RunArgs): { body?: string; contentType: string | null } {
  switch (args.bodyMode) {
    case 'none':
      return { body: undefined, contentType: null };
    case 'json':
      return { body: args.bodyText, contentType: 'application/json' };
    case 'text':
      return { body: args.bodyText, contentType: 'text/plain' };
    case 'xml':
      return { body: args.bodyText, contentType: 'application/xml' };
    case 'urlencoded': {
      const body = enabledRows(args.formRows)
        .map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`)
        .join('&');
      return { body, contentType: 'application/x-www-form-urlencoded' };
    }
    case 'form': {
      const boundary = `----forge${Date.now()}`;
      const body =
        enabledRows(args.formRows)
          .map(
            (r) =>
              `--${boundary}\r\nContent-Disposition: form-data; name="${r.key}"\r\n\r\n${r.value}\r\n`,
          )
          .join('') + `--${boundary}--\r\n`;
      return { body, contentType: `multipart/form-data; boundary=${boundary}` };
    }
    case 'graphql': {
      const bodyObject: Record<string, unknown> = { query: args.query };
      if (args.variables !== undefined) bodyObject.variables = args.variables;
      if (args.operationName) bodyObject.operationName = args.operationName;
      return { body: JSON.stringify(bodyObject), contentType: 'application/json' };
    }
  }
}

/**
 * Execute an HTTP request against `url`. The request runs in the main process (via
 * `window.forge.apiRequest`) so there's no renderer CORS. Never throws — transport failures come
 * back as `networkError`. In graphql mode a 200 carrying `errors[]` is reported as not-ok.
 */
export async function runHttp(args: RunArgs): Promise<ExecutionResult> {
  const isGraphql = args.bodyMode === 'graphql';
  // GraphQL is always POSTed regardless of the method selector.
  const method: HttpMethod = isGraphql ? 'POST' : args.method;

  const requestHeaders: Record<string, string> = { ...args.headers };
  const url = applyAuth(args.url, args.auth, requestHeaders);

  const { body, contentType } = buildBody(args);
  if (contentType && body !== undefined && !hasHeader(requestHeaders, 'content-type')) {
    requestHeaders['content-type'] = contentType;
  }

  const operationType: OperationType | undefined = isGraphql
    ? (detectOperationType(args.query) ?? 'query')
    : undefined;
  const startedAt = Date.now();
  const startPerf = now();

  const result = await window.forge.apiRequest({ url, method, headers: requestHeaders, body });

  const durationMs = Math.round(now() - startPerf);
  const requestSize = byteLength(body ?? '');

  if (!result.ok) {
    return {
      ok: false,
      httpStatus: null,
      httpStatusText: '',
      networkError: result.error,
      raw: '',
      responseHeaders: {},
      startedAt,
      durationMs,
      requestSize,
      responseSize: 0,
      method,
      url,
      operationName: args.operationName,
      operationType,
    };
  }

  const { status, statusText, body: raw, headers: responseHeaders } = result.data;
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = undefined; // non-JSON body (e.g. an HTML error page) — surfaced via `raw`.
  }

  const errors = isGraphql ? extractGraphqlErrors(parsed) : undefined;
  // GraphQL pretty-prints the `data` field; REST pretty-prints the whole parsed body (handled by
  // the response viewer's raw fallback), so we only set `data` in graphql mode.
  const data =
    isGraphql && parsed && typeof parsed === 'object'
      ? (parsed as { data?: unknown }).data
      : undefined;
  const ok = status >= 200 && status < 300 && !errors;

  return {
    ok,
    httpStatus: status,
    httpStatusText: statusText,
    data,
    errors,
    raw,
    responseHeaders,
    startedAt,
    durationMs,
    requestSize,
    responseSize: byteLength(raw),
    method,
    url,
    operationName: args.operationName,
    operationType,
  };
}
