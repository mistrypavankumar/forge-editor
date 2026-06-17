import { GitBranch, CircleX, TriangleAlert, Check, Sparkles, FlaskConical } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { problemCounts } from '../data/problems';
import { testSummary } from '../data/tests';
import { projectStatus } from '../data/workspace-meta';
import { cn } from '../lib/cn';

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
  const counts = problemCounts();
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);

  const openBottom = (tab: 'problems' | 'tests'): void => {
    setBottomTab(tab);
    setPanelVisible('bottom', true);
  };

  return (
    <footer
      data-testid="statusbar-region"
      className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-surface"
    >
      <div className="flex h-full items-center">
        <Segment onClick={() => openBottom('problems')} className="text-accent hover:text-accent">
          <GitBranch size={12} />
          {projectStatus.branch}
        </Segment>
        <Segment onClick={() => openBottom('problems')}>
          <CircleX size={12} className={counts.errors ? 'text-danger' : ''} />
          {counts.errors}
          <TriangleAlert size={12} className="ml-1" />
          {counts.warnings}
        </Segment>
      </div>

      <div className="flex h-full items-center">
        <Segment>
          <Check size={12} className="text-success" />
          TypeScript
        </Segment>
        <Segment onClick={() => openBottom('tests')}>
          <FlaskConical size={12} className={testSummary.failed ? 'text-warning' : 'text-success'} />
          {testSummary.passed}/{testSummary.passed + testSummary.failed}
        </Segment>
        <Segment>Build passing</Segment>
        <Segment>Prettier</Segment>
        <span className="mx-1 h-3 w-px bg-line" />
        <Segment>Ln 23, Col 32</Segment>
        <Segment>Spaces: 2</Segment>
        <Segment>{projectStatus.encoding}</Segment>
        <Segment className="text-accent">
          <Sparkles size={12} />
          Indexed
        </Segment>
      </div>
    </footer>
  );
}
