import {
  CircleX,
  TriangleAlert,
  Sparkles,
  GitBranch,
  Lock,
  Cloud,
  Check,
  User,
  Coffee,
  Loader,
  Zap,
  Ghost,
} from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useInlineRunStore } from '../stores/inline-run-store';
import { useAiStore } from '../stores/ai-store';
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
  const activePath = useEditorStore((s) => s.activePath);
  const ghostEnabled = useAiStore((s) => s.inlineSuggest);
  const toggleGhost = useAiStore((s) => s.toggleInlineSuggest);
  const inlineEnabled = useInlineRunStore((s) => s.enabled);
  const inlineByPath = useInlineRunStore((s) => s.byPath);
  const toggleInline = useInlineRunStore((s) => s.toggle);
  const inlineState = activePath ? inlineByPath[activePath] : undefined;
  const inlineRunning = inlineState?.running ?? false;
  const inlineLogCount = inlineState?.logs.length ?? 0;
  const inlineErrorCount =
    (inlineState?.logs.filter((l) => l.level === 'error').length ?? 0) + (inlineState?.error ? 1 : 0);
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
        <Segment
          onClick={toggleGhost}
          className={ghostEnabled ? 'text-accent' : undefined}
          title={
            ghostEnabled
              ? 'AI inline suggestions are ON — ghost text appears as you type; Tab to accept. Click to turn off.'
              : 'AI inline suggestions are OFF — click to turn on Copilot-style ghost text.'
          }
        >
          <Ghost size={12} />
          {ghostEnabled ? 'Ghost: on' : 'Ghost'}
        </Segment>
        <Segment
          onClick={toggleInline}
          className={
            inlineEnabled ? (inlineErrorCount ? 'text-danger' : 'text-accent') : undefined
          }
          title={
            inlineEnabled
              ? 'Live inline output is ON (⌘⇧L). console.log results appear next to executed lines. Only code that actually runs produces output.'
              : 'Live inline output is OFF — click or press ⌘⇧L to show console.log results inline.'
          }
        >
          {inlineRunning ? <Loader size={12} className="animate-spin" /> : <Zap size={12} />}
          {inlineEnabled ? (inlineRunning ? 'Inline: running…' : `Inline: ${inlineLogCount}`) : 'Inline'}
        </Segment>
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
