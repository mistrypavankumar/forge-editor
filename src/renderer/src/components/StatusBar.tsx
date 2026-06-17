import { CircleX, TriangleAlert, Sparkles, FolderGit2 } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useWorkbenchStatusStore, markerCounts } from '../stores/workbench-status-store';
import { cn } from '../lib/cn';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function Segment({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}): React.JSX.Element {
  const base = cn(
    'flex h-full items-center gap-1.5 px-2.5 text-[11px] text-muted',
    onClick && 'transition-colors hover:bg-surface-3 hover:text-fg',
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={base}>
      {children}
    </button>
  ) : (
    <span className={base}>{children}</span>
  );
}

export function StatusBar(): React.JSX.Element {
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const cursor = useWorkbenchStatusStore((s) => s.cursor);
  const language = useWorkbenchStatusStore((s) => s.language);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const counts = markerCounts(markers);

  const openProblems = (): void => {
    setBottomTab('problems');
    setPanelVisible('bottom', true);
  };

  return (
    <footer
      data-testid="statusbar-region"
      className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-surface"
    >
      <div className="flex h-full items-center">
        {rootPath ? (
          <Segment className="text-accent">
            <FolderGit2 size={12} />
            {basename(rootPath)}
          </Segment>
        ) : null}
        <Segment onClick={openProblems}>
          <CircleX size={12} className={counts.errors ? 'text-danger' : ''} />
          {counts.errors}
          <TriangleAlert size={12} className={cn('ml-1', counts.warnings ? 'text-warning' : '')} />
          {counts.warnings}
        </Segment>
      </div>

      <div className="flex h-full items-center">
        <Segment className="uppercase">{language}</Segment>
        <Segment>
          Ln {cursor.line}, Col {cursor.column}
        </Segment>
        <Segment>Spaces: 2</Segment>
        <Segment>UTF-8</Segment>
        <Segment className="text-accent">
          <Sparkles size={12} />
          Ready
        </Segment>
      </div>
    </footer>
  );
}
