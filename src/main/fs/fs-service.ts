import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DirEntry } from '@shared/ipc-contract';

export function sortDirEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readDirectoryEntries(dirPath: string): Promise<DirEntry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries: DirEntry[] = dirents.map((d) => ({
    name: d.name,
    path: join(dirPath, d.name),
    isDirectory: d.isDirectory(),
  }));
  return sortDirEntries(entries);
}

export async function readFileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileText(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
}
