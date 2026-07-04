import type { SearchOptions } from '@shared/ipc-contract';

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the match regex for a search query, mirroring the flags git grep uses on the main side
 * (buildSearchRegExp in search-service.ts) so what the UI highlights matches what was searched.
 * Always global (for iterating occurrences). Returns null when the pattern is an invalid regex.
 */
export function buildSearchRegExp(options: SearchOptions): RegExp | null {
  try {
    let pattern = options.regex ? options.query : escapeRegExp(options.query);
    if (options.wholeWord) pattern = `\\b${pattern}\\b`;
    return new RegExp(pattern, `g${options.caseSensitive ? '' : 'i'}`);
  } catch {
    return null;
  }
}

/**
 * Compute the replacement text for a single match, mirroring String.replace semantics on the main
 * side (replaceInFiles) so `$1`/`$&` capture references preview exactly as they'll be written.
 */
export function replacementFor(match: RegExpExecArray, re: RegExp, replacement: string): string {
  try {
    return match[0].replace(new RegExp(re.source, re.flags.replace('g', '')), replacement);
  } catch {
    return replacement;
  }
}
