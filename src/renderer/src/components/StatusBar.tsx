import { CircleX, TriangleAlert, Sparkles, GitBranch, GitCommitVertical } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useWorkbenchStatusStore, markerCounts } from '../stores/workbench-status-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { FormatterSegment } from './FormatterSegment';
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
  const blame = useWorkbenchStatusStore((s) => s.blame);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const branch = useWorkspaceStore((s) => s.branch);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const projectDiagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const hasRun = useDiagnosticsStore((s) => s.hasRun);
  // After a project-wide check, show its codebase counts; otherwise the open-file markers.
  const counts = hasRun
    ? {
        errors: projectDiagnostics.filter((d) => d.severity === 'error').length,
        warnings: projectDiagnostics.filter((d) => d.severity === 'warning').length,
        infos: 0,
      }
    : markerCounts(markers);

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
            <GitBranch size={12} />
            {branch ?? basename(rootPath)}
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
        {blame ? (
          <Segment className="text-faint">
            <GitCommitVertical size={12} />
            {blame}
          </Segment>
        ) : null}
        <FormatterSegment />
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
