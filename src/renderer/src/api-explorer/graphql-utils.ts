import { print, parse } from 'graphql';

import type { GraphQLError, OperationType } from './types';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parse the variables editor contents. Empty is valid (no variables); else a JSON object. */
export function parseVariables(text: string): ParseResult<Record<string, unknown> | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: undefined };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Variables must be a JSON object, e.g. { "id": 1 }.' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
}

/** Pretty-print a JSON string; returns the original text on parse failure. */
export function prettyJson(text: string): ParseResult<string> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: '' };
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(trimmed), null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
}

/** Format (prettify) a GraphQL document — doubles as a syntax validator. */
export function formatGraphql(query: string): ParseResult<string> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: 'Query is empty.' };
  try {
    return { ok: true, value: print(parse(trimmed)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid GraphQL syntax.' };
  }
}

export function validateGraphql(query: string): ParseResult<true> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: 'Query is empty.' };
  try {
    parse(trimmed);
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid GraphQL syntax.' };
  }
}

export function detectOperationType(query: string): OperationType | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  try {
    const doc = parse(trimmed);
    for (const def of doc.definitions) {
      if (def.kind === 'OperationDefinition') return def.operation;
    }
  } catch {
    // Fall through to the heuristic for in-progress / invalid docs.
  }
  const keyword = /\b(query|mutation|subscription)\b/.exec(trimmed);
  if (keyword) return keyword[1] as OperationType;
  return /^\s*\{/.test(trimmed) ? 'query' : undefined;
}

export function extractOperationName(query: string): string {
  try {
    const doc = parse(query);
    for (const def of doc.definitions) {
      if (def.kind === 'OperationDefinition' && def.name?.value) return def.name.value;
    }
  } catch {
    const named = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/.exec(query);
    if (named) return named[1];
  }
  return 'AnonymousOperation';
}

export function isIntrospectionQuery(query: string): boolean {
  return /\b__schema\b|\b__type\b/.test(query);
}

/** Header keys whose values must never be shown in full (compared case-insensitively). */
export const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'secret',
  'apikey',
  'x-api-key',
  'cookie',
] as const;

export function isSensitiveHeader(key: string): boolean {
  return SENSITIVE_HEADER_KEYS.includes(
    key.trim().toLowerCase() as (typeof SENSITIVE_HEADER_KEYS)[number],
  );
}

export function maskHeaderValue(key: string, value: string): string {
  if (!isSensitiveHeader(key)) return value;
  const scheme = /^(Bearer|Basic)\s+/i.exec(value);
  if (scheme) return `${scheme[1]} ********`;
  return '********';
}

export function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function summarizeResponse(args: {
  httpStatus: number | null;
  errorCount: number;
  networkError?: string;
}): string {
  if (args.networkError) return `Network error: ${args.networkError}`;
  if (args.errorCount > 0) {
    return `${args.errorCount} GraphQL error${args.errorCount > 1 ? 's' : ''}`;
  }
  return `HTTP ${args.httpStatus ?? '—'} · OK`;
}

export function extractGraphqlErrors(body: unknown): GraphQLError[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  return errors.map((e) => {
    const err = (e ?? {}) as Record<string, unknown>;
    return {
      message: typeof err.message === 'string' ? err.message : 'GraphQL error',
      path: Array.isArray(err.path) ? (err.path as Array<string | number>) : undefined,
      locations: Array.isArray(err.locations)
        ? (err.locations as Array<{ line: number; column: number }>)
        : undefined,
      extensions:
        err.extensions && typeof err.extensions === 'object'
          ? (err.extensions as Record<string, unknown>)
          : undefined,
    };
  });
}
