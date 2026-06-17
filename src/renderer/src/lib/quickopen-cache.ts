import type { FileItem } from '@shared/ipc-contract';

// File-list cache shared by quick-open and the folder-open prefetch.
let cache: { key: string; files: FileItem[] } | null = null;

export function getCachedFiles(rootPath: string): FileItem[] | null {
  return cache && cache.key === rootPath ? cache.files : null;
}

export async function loadFiles(rootPath: string): Promise<FileItem[]> {
  const hit = getCachedFiles(rootPath);
  if (hit) return hit;
  const res = await window.forge.listFiles(rootPath);
  const files = res.ok ? res.data : [];
  cache = { key: rootPath, files };
  return files;
}
