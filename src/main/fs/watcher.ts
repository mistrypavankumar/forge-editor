import { watch, type FSWatcher } from 'node:fs';
import type { WebContents } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';

let watcher: FSWatcher | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Watch the workspace recursively and notify the renderer (debounced) on changes. */
export function watchWorkspace(sender: WebContents, rootPath: string): void {
  watcher?.close();
  watcher = null;
  try {
    watcher = watch(rootPath, { recursive: true }, (_event, filename) => {
      const name = filename?.toString() ?? '';
      if (name.includes('node_modules')) return; // ignore dependency churn
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.fsChanged);
      }, 300);
    });
  } catch {
    // recursive watch may be unsupported on some platforms; ignore.
  }
}

export function stopWatching(): void {
  watcher?.close();
  watcher = null;
}
