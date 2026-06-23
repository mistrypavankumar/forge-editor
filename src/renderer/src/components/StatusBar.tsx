import {
  CircleX,
  TriangleAlert,
  Sparkles,
  GitBranch,
  GitCommitVertical,
  Lock,
  Cloud,
  Check,
  User,
  Coffee,
  Loader,
} from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useAwsStore } from '../stores/aws-store';
import { useGitUserStore } from '../stores/git-user-store';
import { isProtectedBranch } from '../lib/protected-branch';
import { useWorkbenchStatusStore, markerCounts } from '../stores/workbench-status-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJavaStatusStore } from '../stores/java-status-store';
import { FormatterSegment } from './FormatterSegment';
import { cn } from '../lib/cn';
import type { JdtlsStatus } from '@shared/ipc-contract';

/** Status-bar presentation for the jdtls lifecycle. */
const JAVA_STATUS: Record<JdtlsStatus, { label: string; title: string; className?: string }> = {
  idle: { label: 'Java', title: 'Java language server not started yet' },
  starting: {
    label: 'Java: starting…',
    title: 'Eclipse JDT language server is starting and importing the project',
    className: 'text-warning',
  },
  ready: {
    label: 'Java: ready',
    title: 'Eclipse JDT language server is running (completions, hover, go-to-definition)',
    className: 'text-accent',
  },
  unavailable: {
    label: 'Java: not available',
    title: 'jdtls was not found. Install a JDK 17+ and jdtls (e.g. `brew install jdtls`), then reopen.',
    className: 'text-danger',
  },
};

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function Segment({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}): React.JSX.Element {
  const base = cn(
    'flex h-full items-center gap-1.5 px-2.5 text-[11px] text-muted',
    onClick && 'transition-colors hover:bg-surface-3 hover:text-fg',
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={base} title={title}>
      {children}
    </button>
  ) : (
    <span className={base} title={title}>
      {children}
    </span>
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
  const awsActive = useAwsStore((s) => s.active);
  const awsStatuses = useAwsStore((s) => s.statuses);
  const openAwsPicker = useAwsStore((s) => s.openPicker);
  const gitUser = useGitUserStore((s) => s.active);
  const openGitUserPicker = useGitUserStore((s) => s.openPicker);
  const javaStatus = useJavaStatusStore((s) => s.status);
  const awsActiveStatus = awsActive ? awsStatuses[awsActive] : undefined;
  const awsValid = Boolean(awsActiveStatus && awsActiveStatus !== 'pending' && awsActiveStatus.valid);
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
          <Segment
            className="text-accent"
            title={isProtectedBranch(branch) ? `${branch} is a protected branch` : undefined}
          >
            {isProtectedBranch(branch) ? <Lock size={12} /> : <GitBranch size={12} />}
            {branch ?? basename(rootPath)}
          </Segment>
        ) : null}
        {rootPath ? (
          <Segment onClick={openGitUserPicker} title="Switch git user">
            <User size={12} />
            {gitUser?.name || 'Set git user'}
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
        <Segment
          onClick={openAwsPicker}
          className={awsValid ? 'text-accent' : undefined}
          title="Switch AWS connection"
        >
          {awsValid ? <Check size={12} /> : <Cloud size={12} />}
          AWS: {awsActive ? `profile:${awsActive}` : 'No connection'}
        </Segment>
        {blame ? (
          <Segment className="text-faint">
            <GitCommitVertical size={12} />
            {blame}
          </Segment>
        ) : null}
        {language === 'java' ? (
          <Segment className={JAVA_STATUS[javaStatus].className} title={JAVA_STATUS[javaStatus].title}>
            {javaStatus === 'starting' ? (
              <Loader size={12} className="animate-spin" />
            ) : (
              <Coffee size={12} />
            )}
            {JAVA_STATUS[javaStatus].label}
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
