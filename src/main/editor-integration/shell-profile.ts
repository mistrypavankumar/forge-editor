import { join } from 'node:path';

export const BLOCK_START = '# >>> forge editor integration >>>';
export const BLOCK_END = '# <<< forge editor integration <<<';

export function buildBlock(bodyLines: string[]): string {
  return [BLOCK_START, ...bodyLines, BLOCK_END].join('\n');
}

export function hasBlock(content: string): boolean {
  return content.includes(BLOCK_START) && content.includes(BLOCK_END);
}

/** Replace the existing marked block in `content`, or append a fresh one. */
export function upsertBlock(content: string, bodyLines: string[]): string {
  const block = buildBlock(bodyLines);
  if (hasBlock(content)) {
    const re = new RegExp(`${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}`);
    return ensureTrailingNewline(content.replace(re, block));
  }
  const base = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  return ensureTrailingNewline(`${base}\n${block}`);
}

/** Strip the marked block (and a single blank line left behind), if present. */
export function removeBlock(content: string): string {
  if (!hasBlock(content)) return content;
  const re = new RegExp(`\\n?${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}\\n?`);
  return content.replace(re, '\n').replace(/\n{3,}/g, '\n\n');
}

export function profilePathForShell(shell: string | undefined, home: string): string {
  const name = (shell ?? '').split('/').pop() ?? '';
  if (name.includes('zsh')) return join(home, '.zshrc');
  if (name.includes('bash')) return join(home, '.bashrc');
  return join(home, '.profile');
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
