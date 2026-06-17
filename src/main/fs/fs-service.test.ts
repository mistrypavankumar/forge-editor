// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDirectoryEntries, readFileText, sortDirEntries, writeFileText } from './fs-service';

describe('fs-service', () => {
  it('sortDirEntries lists directories before files, alphabetically', () => {
    const sorted = sortDirEntries([
      { name: 'b.ts', path: '/b.ts', isDirectory: false },
      { name: 'src', path: '/src', isDirectory: true },
      { name: 'a.ts', path: '/a.ts', isDirectory: false },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['src', 'a.ts', 'b.ts']);
  });

  it('readDirectoryEntries returns sorted entries for a real dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'file.txt'), 'x');
    const entries = await readDirectoryEntries(dir);
    expect(entries.map((e) => e.name)).toEqual(['sub', 'file.txt']);
    expect(entries[0].isDirectory).toBe(true);
  });

  it('writeFileText then readFileText round-trips', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-'));
    const file = join(dir, 'note.txt');
    await writeFileText(file, 'hello');
    expect(await readFileText(file)).toBe('hello');
  });
});
