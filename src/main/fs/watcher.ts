import { watch, type FSWatcher } from 'node:fs';
import type { WebContents } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';

interface WindowWatch {
  watcher: FSWatcher;
  debounce: ReturnType<typeof setTimeout> | null;
}

// Keyed by the owning window's webContents id. A single global watcher would let a
// second window's workspace tear down the first window's watcher, silently freezing
// its file tree — so each window gets its own.
const watches = new Map<number, WindowWatch>();

function close(id: number): void {
  const w = watches.get(id);
  if (!w) return;
  w.watcher.close();
  if (w.debounce) clearTimeout(w.debounce);
  watches.delete(id);
}

/** Watch the workspace recursively and notify the renderer (debounced) on changes. */
export function watchWorkspace(sender: WebContents, rootPath: string): void {
  const id = sender.id;
  close(id); // replace this window's previous watcher (folder switch / reload)
  try {
    const watcher = watch(rootPath, { recursive: true }, (_event, filename) => {
      const name = filename?.toString() ?? '';
      if (name.includes('node_modules')) return; // ignore dependency churn
      const w = watches.get(id);
      if (!w) return;
      if (w.debounce) clearTimeout(w.debounce);
      w.debounce = setTimeout(() => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.fsChanged);
      }, 300);
    });
    watches.set(id, { watcher, debounce: null });
  } catch {
    // recursive watch may be unsupported on some platforms; ignore.
  }
}

/** Stop watching for a single window by its webContents id (call when it closes). */
export function stopWatchingForWindow(webContentsId: number): void {
  close(webContentsId);
}

export function stopWatching(): void {
  for (const id of [...watches.keys()]) close(id);
}
