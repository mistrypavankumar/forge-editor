import type { ParamRow } from './types';

let seq = 0;

/** Generate a stable-enough row id for params/headers/form fields. */
export function rowId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Split a URL into its base (before `?`) and raw query string (after `?`, without the `?`). */
export function splitUrl(url: string): { base: string; queryString: string } {
  const i = url.indexOf('?');
  if (i === -1) return { base: url, queryString: '' };
  return { base: url.slice(0, i), queryString: url.slice(i + 1) };
}

/** Parse a URL's query string into param rows (all enabled). */
export function parseQueryParams(url: string): ParamRow[] {
  const { queryString } = splitUrl(url);
  if (!queryString) return [];
  return queryString
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return { id: rowId('p'), key: safeDecode(key), value: safeDecode(value), enabled: true };
    });
}

/** Rebuild a full URL from `base` (its existing query is dropped) and the enabled param rows. */
export function buildUrl(base: string, params: ParamRow[]): string {
  const cleanBase = splitUrl(base).base;
  const query = params
    .filter((p) => (p.enabled ?? true) && p.key.trim())
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return query ? `${cleanBase}?${query}` : cleanBase;
}
