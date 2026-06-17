import { FolderOpen } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { FileTree } from './FileTree';
import { IconButton } from './ui/IconButton';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Real file-system tree (backs the Structure tab). */
export function FileExplorer(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const onOpenFolder = async (): Promise<void> => {
    const res = await window.forge.openFolder();
    if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
  };

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-faint">No folder opened</p>
        <button
          type="button"
          onClick={() => void onOpenFolder()}
          className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span className="truncate">{basename(rootPath)}</span>
        <IconButton label="Change folder" className="h-6 w-6" onClick={() => void onOpenFolder()}>
          <FolderOpen size={13} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        <FileTree entries={rootEntries} />
      </div>
    </div>
  );
}
