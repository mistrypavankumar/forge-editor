import { X } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { FileTypeIcon } from './file-icon';
import { cn } from '../lib/cn';

export function EditorTabs(): React.JSX.Element | null {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto bg-surface">
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        return (
          <div
            key={tab.path}
            onClick={() => setActive(tab.path)}
            className={cn(
              'group relative flex max-w-[200px] cursor-pointer items-center gap-2 pl-3 pr-2 text-xs',
              isActive
                ? 'bg-bg text-fg'
                : 'text-faint hover:bg-surface-2 hover:text-muted',
            )}
          >
            {isActive ? <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" /> : null}
            <FileTypeIcon name={tab.name} />
            <span className="truncate">{tab.name}</span>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeFile(tab.path);
              }}
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-surface-3 hover:text-fg',
                tab.dirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {tab.dirty ? (
                <span className="h-2 w-2 rounded-full bg-warning group-hover:hidden" />
              ) : null}
              <X size={13} className={cn(tab.dirty && 'hidden group-hover:block')} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
