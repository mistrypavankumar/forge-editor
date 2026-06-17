import { GitBranch, CircleX, TriangleAlert, Check, Sparkles, FlaskConical } from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { problemCounts } from '../data/problems';
import { testSummary } from '../data/tests';
import { projectStatus } from '../data/workspace-meta';
import { cn } from '../lib/cn';

function Segment({
  children,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  accent?: boolean;
}): React.JSX.Element {
  const className = cn(
    'flex h-full items-center gap-1.5 px-2 text-[11px]',
    accent ? 'text-accent-fg' : 'text-muted',
    onClick && 'hover:bg-white/10',
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
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
      className="flex h-6 shrink-0 items-center justify-between bg-accent text-accent-fg"
    >
      <div className="flex h-full items-center">
        <Segment accent>
          <GitBranch size={12} />
          {projectStatus.branch}
        </Segment>
        <Segment accent onClick={() => openBottom('problems')}>
          <CircleX size={12} />
          {counts.errors}
          <TriangleAlert size={12} className="ml-1.5" />
          {counts.warnings}
        </Segment>
      </div>

      <div className="flex h-full items-center">
        <Segment accent>
          <Check size={12} />
          TypeScript
        </Segment>
        <Segment accent onClick={() => openBottom('tests')}>
          <FlaskConical size={12} />
          {testSummary.passed}/{testSummary.passed + testSummary.failed} passing
        </Segment>
        <Segment accent>Build: passing</Segment>
        <Segment accent>Prettier</Segment>
        <Segment accent>Ln 23, Col 32</Segment>
        <Segment accent>Spaces: 2</Segment>
        <Segment accent>{projectStatus.encoding}</Segment>
        <Segment accent>
          <Sparkles size={12} />
          Indexed
        </Segment>
      </div>
    </footer>
  );
}
