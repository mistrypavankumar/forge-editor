import { FolderOpen, FileText, Clock } from 'lucide-react';
import { useRecentsStore } from '../stores/recents-store';
import { ModernFileIcon } from './ModernFileIcon';
import { ModernFolderIcon } from './ModernFolderIcon';
import {
  openFolderDialog,
  openFileDialog,
  openFolderPath,
  openFilePath,
} from '../lib/workspace-actions';

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : path;
}

export function Landing(): React.JSX.Element {
  const recents = useRecentsStore((s) => s.recents);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-bg px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-fg">
        F
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">Forge</h1>
      <p className="mt-2 text-sm text-faint">Open a folder or a file to get started.</p>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={() => void openFolderDialog()}
          className="group flex w-52 flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50 hover:bg-surface-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <FolderOpen size={18} />
          </span>
          <span className="flex flex-col">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              Open Folder
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
                ⌘O
              </kbd>
            </span>
            <span className="mt-0.5 text-[12px] text-faint">Work on a whole project</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => void openFileDialog()}
          className="group flex w-52 flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50 hover:bg-surface-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 text-info">
            <FileText size={18} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-fg">Open File</span>
            <span className="mt-0.5 text-[12px] text-faint">Edit a single file</span>
          </span>
        </button>
      </div>

      {recents.length > 0 ? (
        <div className="mt-10 w-[26rem] max-w-full">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
            <Clock size={12} /> Recent
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {recents.map((r) => (
              <button
                key={`${r.type}:${r.path}`}
                type="button"
                onClick={() =>
                  void (r.type === 'folder' ? openFolderPath(r.path) : openFilePath(r.path, r.name))
                }
                className="flex w-full items-center gap-2.5 border-b border-line-soft px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
              >
                {r.type === 'folder' ? (
                  <ModernFolderIcon name={r.name} />
                ) : (
                  <ModernFileIcon name={r.name} />
                )}
                <span className="truncate text-[13px] text-fg">{r.name}</span>
                <span className="ml-auto truncate pl-3 text-[11px] text-faint">{dirOf(r.path)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
