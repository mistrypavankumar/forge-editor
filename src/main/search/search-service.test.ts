import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSearchRegExp, replaceInFiles } from './search-service';
import type { SearchOptions } from '@shared/ipc-contract';

const opts = (over: Partial<SearchOptions>): SearchOptions => ({
  query: 'foo',
  regex: false,
  caseSensitive: false,
  wholeWord: false,
  ...over,
});

describe('buildSearchRegExp', () => {
  it('escapes special characters in plain (non-regex) mode', () => {
    const re = buildSearchRegExp(opts({ query: 'a.b' }));
    expect(re.test('axb')).toBe(false);
    expect(re.test('a.b')).toBe(true);
  });

  it('treats the query as a pattern in regex mode', () => {
    const re = buildSearchRegExp(opts({ query: 'a.b', regex: true }));
    expect(re.test('axb')).toBe(true);
  });

  it('is case-insensitive by default and case-sensitive when set', () => {
    expect(buildSearchRegExp(opts({})).test('FOO')).toBe(true);
    expect(buildSearchRegExp(opts({ caseSensitive: true })).test('FOO')).toBe(false);
  });

  it('matches whole words only when wholeWord is set', () => {
    const re = buildSearchRegExp(opts({ wholeWord: true }));
    expect(re.test('foobar')).toBe(false);
    expect(re.test('a foo b')).toBe(true);
  });
});

describe('replaceInFiles', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'forge-replace-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('replaces all occurrences and reports counts', async () => {
    await fs.writeFile(join(dir, 'a.ts'), 'const foo = foo + 1;\n');
    const res = await replaceInFiles(dir, opts({ query: 'foo' }), 'bar', ['a.ts']);
    expect(res).toEqual({ files: 1, replacements: 2 });
    expect(await fs.readFile(join(dir, 'a.ts'), 'utf8')).toBe('const bar = bar + 1;\n');
  });

  it('leaves files without matches untouched', async () => {
    await fs.writeFile(join(dir, 'b.ts'), 'const x = 1;\n');
    const res = await replaceInFiles(dir, opts({ query: 'foo' }), 'bar', ['b.ts']);
    expect(res).toEqual({ files: 0, replacements: 0 });
  });

  it('respects case sensitivity', async () => {
    await fs.writeFile(join(dir, 'c.ts'), 'Foo foo');
    const res = await replaceInFiles(dir, opts({ query: 'foo', caseSensitive: true }), 'x', ['c.ts']);
    expect(res.replacements).toBe(1);
    expect(await fs.readFile(join(dir, 'c.ts'), 'utf8')).toBe('Foo x');
  });
});
