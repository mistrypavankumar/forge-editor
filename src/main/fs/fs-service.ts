import { promises as fs } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { DirEntry, FileItem } from '@shared/ipc-contract';

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

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

export async function listFilesRecursive(rootPath: string): Promise<FileItem[]> {
  const results: FileItem[] = [];
  async function walk(dir: string): Promise<void> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (IGNORED_DIRS.has(d.name)) continue;
        await walk(full);
      } else {
        results.push({ name: d.name, path: full, relPath: relative(rootPath, full) });
      }
    }
  }
  await walk(rootPath);
  return results;
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath);
}

export async function deleteEntry(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true });
}

export async function copyEntry(src: string, destDir: string): Promise<void> {
  await fs.cp(src, join(destDir, basename(src)), { recursive: true });
}

export async function moveEntry(src: string, destDir: string): Promise<void> {
  await fs.rename(src, join(destDir, basename(src)));
}

export async function makeDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

/** Read the current git branch (or short SHA if detached) from .git/HEAD; null if not a repo. */
export async function readGitBranch(rootPath: string): Promise<string | null> {
  try {
    let gitDir = join(rootPath, '.git');
    const stat = await fs.stat(gitDir);
    if (stat.isFile()) {
      const content = (await fs.readFile(gitDir, 'utf8')).trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (m) gitDir = resolve(rootPath, m[1]);
    }
    const head = (await fs.readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (ref) return ref[1];
    return head.slice(0, 7);
  } catch {
    return null;
  }
}
