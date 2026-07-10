import type { BrowserNetworkEvent, BrowserNetworkType } from '@shared/ipc-contract';

/**
 * Pure helpers for the Browser Debug Network/GraphQL tabs: classifying a captured request,
 * extracting GraphQL operation facts from its body, redacting sensitive headers, and rendering
 * a request as a cURL command. Everything here is a pure function of its inputs (cheap to test);
 * capture itself happens in the injected guest script (see webview-preload.ts).
 */

/** Header names redacted by default (case-insensitive). */
export const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

const REDACTED = '<redacted>';

/** Static-asset file extensions we treat as `asset` (ignored from most views by default). */
const ASSET_EXT = new Set([
  'js', 'mjs', 'cjs', 'css', 'map',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif', 'bmp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov',
]);

export type GraphQLOperationType = 'query' | 'mutation' | 'subscription' | 'unknown';

/** GraphQL facts derived from a request/response pair (host-side, from the captured strings). */
export interface BrowserGraphQLEvent {
  /** Same id as the backing network event. */
  id: string;
  networkId: string;
  operationName?: string;
  operationType?: GraphQLOperationType;
  query?: string;
  variables?: unknown;
  errors?: unknown[];
  dataPreview?: unknown;
  url: string;
  status?: number;
  durationMs?: number;
  routePath?: string;
  /** >1 when the request was a batched array of operations. */
  batchSize?: number;
  /** True when either GraphQL `errors` were present or the HTTP status was not 2xx. */
  failed: boolean;
}

/**
 * True when a URL points at a local dev target (localhost, loopback, `*.local`, or an RFC-1918
 * private IP). Captured events from non-local pages are dropped unless the user opts in — this
 * feature is meant for local development, not for snooping on arbitrary sites.
 */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url, 'http://localhost').hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d{1,3})\./.exec(host);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** Extract the pathname from a URL string; tolerant of relative URLs. */
function pathnameOf(url: string): string {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url;
  }
}

function extensionOf(pathname: string): string {
  const base = pathname.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Parse a request body string as JSON, returning undefined on any failure. */
function tryJson(body: string | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** True when a parsed body looks like a GraphQL request (single op or batch). */
function looksLikeGraphQL(parsed: unknown): boolean {
  const one = (v: unknown): boolean =>
    !!v && typeof v === 'object' && ('query' in v || 'operationName' in v);
  if (Array.isArray(parsed)) return parsed.length > 0 && parsed.every(one);
  return one(parsed);
}

/**
 * Classify a captured request. `responseContentType` (when known) refines the guess — e.g. an
 * extension-less URL returning `text/html` is a document, `application/json` is a REST call.
 */
export function classifyNetwork(
  url: string,
  _method: string,
  requestBody?: string,
  responseContentType?: string,
): BrowserNetworkType {
  const path = pathnameOf(url);
  const ct = (responseContentType ?? '').toLowerCase();

  // GraphQL: conventional endpoint or a GraphQL-shaped body.
  if (/\/graphql\b/i.test(path) || looksLikeGraphQL(tryJson(requestBody))) return 'graphql';

  const ext = extensionOf(path);
  if (ASSET_EXT.has(ext)) return 'asset';
  if (ct.startsWith('image/') || ct.startsWith('font/') || ct.startsWith('video/') || ct.startsWith('audio/')) {
    return 'asset';
  }
  if (ct.includes('javascript') || ct.includes('text/css')) return 'asset';

  if (ct.includes('text/html')) return 'document';

  if (/\/api(\/|$)/i.test(path) || ct.includes('application/json') || ct.includes('+json')) return 'rest';

  // A JSON request body with no other signal is almost always an API call.
  if (tryJson(requestBody) !== undefined) return 'rest';

  return 'unknown';
}

/** Derive the operation type from a query document's leading keyword. */
export function operationTypeFromQuery(query: string | undefined): GraphQLOperationType {
  if (!query) return 'unknown';
  // Drop leading line/block comments and whitespace.
  const cleaned = query.replace(/^\s*(#[^\n]*\n|\s)+/, '');
  const m = /^(query|mutation|subscription)\b/i.exec(cleaned);
  if (m) return m[1].toLowerCase() as GraphQLOperationType;
  // A bare `{ ... }` selection set is an anonymous query.
  if (cleaned.startsWith('{')) return 'query';
  return 'unknown';
}

/** Extract the operation name from a query document (e.g. `query GetUsers(...)` → `GetUsers`). */
export function operationNameFromQuery(query: string | undefined): string | undefined {
  if (!query) return undefined;
  const m = /\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(query);
  return m?.[2];
}

interface GraphQLBodyOp {
  operationName?: string;
  operationType: GraphQLOperationType;
  query?: string;
  variables?: unknown;
}

/**
 * Parse the GraphQL operation(s) from a request body. Handles a single operation object or a
 * batched array (returns the first, with `batchSize` set by the caller). Returns null when the
 * body isn't GraphQL-shaped.
 */
export function parseGraphQL(
  requestBody: string | undefined,
): { primary: GraphQLBodyOp; batchSize: number } | null {
  const parsed = tryJson(requestBody);
  if (!looksLikeGraphQL(parsed)) return null;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const first = list[0] as { query?: string; operationName?: string; variables?: unknown };
  const query = typeof first.query === 'string' ? first.query : undefined;
  return {
    primary: {
      operationName: first.operationName || operationNameFromQuery(query),
      operationType: operationTypeFromQuery(query),
      query,
      variables: first.variables,
    },
    batchSize: list.length,
  };
}

/** Build the derived GraphQL event for a network event, or null if it isn't a GraphQL request. */
export function toGraphQLEvent(net: BrowserNetworkEvent): BrowserGraphQLEvent | null {
  if (net.type !== 'graphql') return null;
  const parsed = parseGraphQL(net.requestBody);
  const response = tryJson(net.responseBody) as
    | { errors?: unknown[]; data?: unknown }
    | undefined;
  const errors = Array.isArray(response?.errors) ? response?.errors : undefined;
  const httpOk = net.status === undefined || (net.status >= 200 && net.status < 300);
  return {
    id: net.id,
    networkId: net.id,
    operationName: parsed?.primary.operationName,
    operationType: parsed?.primary.operationType,
    query: parsed?.primary.query,
    variables: parsed?.primary.variables,
    errors,
    dataPreview: response?.data,
    url: net.url,
    status: net.status,
    durationMs: net.durationMs,
    routePath: net.routePath,
    batchSize: parsed && parsed.batchSize > 1 ? parsed.batchSize : undefined,
    failed: !!errors?.length || !httpOk || !!net.error,
  };
}

/** Return a copy of `headers` with sensitive values masked when `redact` is true. */
export function redactHeaders(
  headers: Record<string, string> | undefined,
  redact: boolean,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = redact && SENSITIVE_HEADERS.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

/** Single-quote a string for safe use inside a shell command (POSIX). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Render a captured request as a copy-pasteable cURL command. Sensitive headers are redacted
 * unless `includeSensitive` is set (the user must opt in to leak real credentials).
 */
export function toCurl(net: BrowserNetworkEvent, includeSensitive = false): string {
  const parts = [`curl -X ${net.method.toUpperCase()} ${shellQuote(net.url)}`];
  const headers = redactHeaders(net.requestHeaders, !includeSensitive);
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  }
  if (net.requestBody) parts.push(`-d ${shellQuote(net.requestBody)}`);
  return parts.join(' \\\n  ');
}
