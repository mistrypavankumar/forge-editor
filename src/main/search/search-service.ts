import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { promisify } from 'node:util';
import type { ReplaceResult, SearchMatch, SearchOptions } from '@shared/ipc-contract';

const run = promisify(execFile);
const MAX_MATCHES = 1000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the JS RegExp used for column detection and replacement — mirrors the git-grep flags. */
export function buildSearchRegExp(options: SearchOptions): RegExp {
  let pattern = options.regex ? options.query : escapeRegExp(options.query);
  if (options.wholeWord) pattern = `\\b${pattern}\\b`;
  return new RegExp(pattern, `g${options.caseSensitive ? '' : 'i'}`);
}

/** Turn a comma/space-separated glob list into git pathspecs. */
function pathspecs(include?: string, exclude?: string): string[] {
  const specs: string[] = [];
  const split = (s: string): string[] => s.split(/[,\s]+/).map((g) => g.trim()).filter(Boolean);
  for (const g of include ? split(include) : []) specs.push(`:(glob)${g}`);
  for (const g of exclude ? split(exclude) : []) specs.push(`:(glob,exclude)${g}`);
  return specs;
}

function grepFlags(options: SearchOptions): string[] {
  const flags = ['-n', '-I', '--no-color', '--untracked', options.regex ? '-E' : '-F'];
  if (!options.caseSensitive) flags.push('-i');
  if (options.wholeWord) flags.push('-w');
  return flags;
}

export async function searchInFiles(
  rootPath: string,
  options: SearchOptions,
): Promise<SearchMatch[]> {
  if (!options.query.trim()) return [];
  let re: RegExp;
  try {
    re = buildSearchRegExp(options);
  } catch {
    return []; // invalid regex
  }
  try {
    const { stdout } = await run(
      'git',
      [
        '-C', rootPath, 'grep', ...grepFlags(options),
        '-e', options.query, '--', ...pathspecs(options.include, options.exclude),
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const matches: SearchMatch[] = [];
    for (const line of stdout.split('\n')) {
      if (matches.length >= MAX_MATCHES) break;
      const i1 = line.indexOf(':');
      const i2 = line.indexOf(':', i1 + 1);
      if (i1 < 0 || i2 < 0) continue;
      const path = line.slice(0, i1);
      const ln = Number(line.slice(i1 + 1, i2));
      if (!Number.isFinite(ln)) continue;
      const text = line.slice(i2 + 1);
      re.lastIndex = 0;
      const m = re.exec(text);
      matches.push({
        path,
        name: basename(path),
        line: ln,
        preview: text.slice(0, 240),
        col: m ? m.index + 1 : 1,
        length: m ? m[0].length : options.query.length,
      });
    }
    return matches;
  } catch {
    // git grep exits non-zero when there are no matches (or not a repo).
    return [];
  }
}

/** Replace all matches of `options` with `replacement` across the given (repo-relative) files. */
export async function replaceInFiles(
  rootPath: string,
  options: SearchOptions,
  replacement: string,
  files: string[],
): Promise<ReplaceResult> {
  if (!options.query.trim() || files.length === 0) return { files: 0, replacements: 0 };
  const re = buildSearchRegExp(options);
  let changedFiles = 0;
  let replacements = 0;
  for (const rel of files) {
    const abs = join(rootPath, rel);
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    re.lastIndex = 0;
    const count = (content.match(re) ?? []).length;
    if (count === 0) continue;
    re.lastIndex = 0;
    const next = content.replace(re, replacement);
    if (next !== content) {
      await fs.writeFile(abs, next, 'utf8');
      changedFiles += 1;
      replacements += count;
    }
  }
  return { files: changedFiles, replacements };
}
