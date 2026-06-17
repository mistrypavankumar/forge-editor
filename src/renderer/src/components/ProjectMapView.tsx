import { useState } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useWorkbenchStatusStore } from '../stores/workbench-status-store';
import { useNavigatorStore } from '../stores/navigator-store';
import { deriveProjectMap, entryMatchesFilter } from '../lib/derive-project-map';
import { openFolderDialog } from '../lib/workspace-actions';
import { ModernFolderIcon } from './ModernFolderIcon';
import { ModernFileIcon } from './ModernFileIcon';
import { ProjectRow, type BadgeTone } from './ProjectRow';
import { cn } from '../lib/cn';

export function ProjectMapView(): React.JSX.Element {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const rootEntries = useWorkspaceStore((s) => s.rootEntries);
  const openFile = useEditorStore((s) => s.openFile);
  const tabs = useEditorStore((s) => s.tabs);
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const filter = useNavigatorStore((s) => s.filter);
  const setTab = useNavigatorStore((s) => s.setTab);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ hidden: true });

  const onOpenFolder = (): void => void openFolderDialog();

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-faint">Open a folder to map your project</p>
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

  const groups = deriveProjectMap(rootEntries, tabs, markers);

  const onEntry = async (name: string, path: string, isFolder: boolean): Promise<void> => {
    if (isFolder) {
      // Scope the Structure tree to this folder's contents.
      const ws = useWorkspaceStore.getState();
      if (ws.childrenByPath[path] === undefined) {
        const res = await window.forge.readDirectory(path);
        if (res.ok) ws.setChildren(path, res.data);
      }
      ws.setScope(path);
      setTab('structure');
      return;
    }
    const res = await window.forge.readFile(path);
    if (res.ok) openFile({ path, name, content: res.data });
  };

  const badgeFor = (e: {
    changed: boolean;
    errors: boolean;
  }): { label: string; tone: BadgeTone } | undefined => {
    if (e.errors) return { label: 'issue', tone: 'issue' };
    if (e.changed) return { label: 'changed', tone: 'changed' };
    return undefined;
  };

  return (
    <div className="h-full space-y-2.5 overflow-auto px-2.5 py-3">
      {groups.map((group) => {
        const entries = group.entries.filter((e) => entryMatchesFilter(e, filter));
        if (entries.length === 0) return null;
        const isCollapsed = collapsed[group.id];
        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-xl border border-line bg-surface/60"
          >
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
            >
              <ModernFolderIcon category={group.category} open={!isCollapsed} size={15} />
              <span className="text-[12px] font-semibold text-fg">{group.title}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">
                  {entries.length}
                </span>
                <ChevronDown
                  size={14}
                  className={cn('text-faint transition-transform', isCollapsed && '-rotate-90')}
                />
              </span>
            </button>
            {!isCollapsed ? (
              <div className="border-t border-line-soft p-1.5">
                {entries.map((entry) => (
                  <ProjectRow
                    key={entry.id}
                    icon={
                      entry.isFolder ? (
                        <ModernFolderIcon category={group.category} name={entry.name} />
                      ) : (
                        <ModernFileIcon name={entry.name} />
                      )
                    }
                    name={entry.name}
                    badge={badgeFor(entry)}
                    onClick={() => void onEntry(entry.name, entry.path, entry.isFolder)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
      <button
        type="button"
        onClick={() => void onOpenFolder()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11px] text-faint hover:text-muted"
      >
        <FolderOpen size={12} /> Change folder
      </button>
    </div>
  );
}
