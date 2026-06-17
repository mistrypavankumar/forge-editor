import { FolderOpen, FileText } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';

export function Landing(): React.JSX.Element {
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const openFile = useEditorStore((s) => s.openFile);

  const onOpenFolder = async (): Promise<void> => {
    const res = await window.forge.openFolder();
    if (res.ok && res.data) setWorkspace(res.data.rootPath, res.data.tree);
  };
  const onOpenFile = async (): Promise<void> => {
    const res = await window.forge.openFileDialog();
    if (res.ok && res.data) openFile(res.data);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-bg px-6">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-fg">
        F
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">Forge</h1>
      <p className="mt-2 text-sm text-faint">Open a folder or a file to get started.</p>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={() => void onOpenFolder()}
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
          onClick={() => void onOpenFile()}
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
    </div>
  );
}
