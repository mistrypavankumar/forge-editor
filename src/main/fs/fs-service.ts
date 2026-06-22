import { promises as fs } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { DirEntry, FileItem } from '@shared/ipc-contract';
import { getIgnoredNames, listProjectFiles } from '../git/git-service';

export function sortDirEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// VCS internals and OS cruft — hidden from the tree like VS Code's default excludes.
const HIDDEN_ENTRIES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db']);

export async function readDirectoryEntries(dirPath: string): Promise<DirEntry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries: DirEntry[] = dirents
    .filter((d) => !HIDDEN_ENTRIES.has(d.name))
    .map((d) => ({
      name: d.name,
      path: join(dirPath, d.name),
      isDirectory: d.isDirectory(),
    }));
  const ignored = await getIgnoredNames(dirPath, entries.map((e) => e.name));
  for (const e of entries) {
    if (ignored.has(e.name)) e.ignored = true;
  }
  return sortDirEntries(entries);
}

export async function readFileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileText(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

/** True when any path segment of the (forward-slash) `relPath` is an ignored folder name. */
function hasIgnoredSegment(relPath: string, ignored: Set<string>): boolean {
  return relPath.split('/').some((seg) => ignored.has(seg));
}

/**
 * Every searchable file under `rootPath` for quick-open. In a git repo this honors
 * .gitignore (via `git ls-files`); otherwise it walks the tree skipping common build
 * dirs. Folder names in `extraIgnore` are always excluded on top of that, letting the
 * user drop noisy folders out of global file search via settings.
 */
export async function listFilesRecursive(
  rootPath: string,
  extraIgnore: string[] = [],
): Promise<FileItem[]> {
  const ignored = new Set([...IGNORED_DIRS, ...extraIgnore]);

  const tracked = await listProjectFiles(rootPath);
  if (tracked) {
    const results: FileItem[] = [];
    for (const relPath of tracked) {
      if (hasIgnoredSegment(relPath, ignored)) continue;
      results.push({ name: basename(relPath), path: join(rootPath, relPath), relPath });
    }
    return results;
  }

  // Not a git repo — walk the filesystem, skipping ignored folders by name.
  const results: FileItem[] = [];
  async function walk(dir: string): Promise<void> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (ignored.has(d.name)) continue;
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
