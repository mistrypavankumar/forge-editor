import { FolderOpen, Clock } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { FileTree } from './FileTree';
import { FileTypeIcon } from './file-icon';
import { PanelHeader, SectionLabel } from './ui/Panel';
import { IconButton } from './ui/IconButton';
import { recentFiles } from '../data/recent';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function FileExplorer(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const onOpenFolder = async (): Promise<void> => {
    const res = await window.forge.openFolder();
    if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={rootPath ? basename(rootPath) : 'Explorer'}
        actions={
          <IconButton
            label="Change folder"
            className="h-6 w-6"
            onClick={() => void onOpenFolder()}
          >
            <FolderOpen size={14} />
          </IconButton>
        }
      />

      {rootPath ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto pb-2">
            <FileTree entries={rootEntries} />
          </div>

          <div className="shrink-0 border-t border-line-soft pb-2">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={11} /> Recently edited
              </span>
            </SectionLabel>
            {recentFiles.map((f) => (
              <div
                key={f.id}
                className="flex h-7 cursor-default items-center gap-1.5 px-3 text-[13px] text-muted hover:bg-surface-2"
              >
                <FileTypeIcon name={f.name} />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto truncate text-[11px] text-faint">{f.dir}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-faint">No folder opened</p>
          <button
            type="button"
            onClick={() => void onOpenFolder()}
            className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Open Folder
          </button>
        </div>
      )}
    </div>
  );
}
