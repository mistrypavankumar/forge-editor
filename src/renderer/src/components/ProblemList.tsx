import { useState } from 'react';
import {
  CircleX, TriangleAlert, Info, CircleCheck, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useWorkbenchStatusStore, type MarkerSeverity } from '../stores/workbench-status-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { openFilePath } from '../lib/workspace-actions';
import { ModernFileIcon } from './ModernFileIcon';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';
import type { ProjectDiagnostic } from '@shared/ipc-contract';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function SeverityIcon({ severity }: { severity: MarkerSeverity }): React.JSX.Element {
  if (severity === 'error') return <CircleX size={14} className="text-danger" />;
  if (severity === 'warning') return <TriangleAlert size={14} className="text-warning" />;
  return <Info size={14} className="text-info" />;
}

export function ProblemList(): React.JSX.Element {
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const running = useDiagnosticsStore((s) => s.running);
  const hasRun = useDiagnosticsStore((s) => s.hasRun);
  const error = useDiagnosticsStore((s) => s.error);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const requestReveal = useEditorStore((s) => s.requestReveal);
  const setActive = useEditorStore((s) => s.setActive);
  const tabs = useEditorStore((s) => s.tabs);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  const openDiagnostic = (d: ProjectDiagnostic): void => {
    if (!rootPath) return;
    const full = `${rootPath}/${d.file}`;
    void openFilePath(full, basename(d.file)).then(() =>
      requestReveal({ path: full, line: d.line, col: d.col }),
    );
  };

  // Group project diagnostics by file.
  const groups = new Map<string, ProjectDiagnostic[]>();
  for (const d of diagnostics) {
    const list = groups.get(d.file) ?? [];
    list.push(d);
    groups.set(d.file, list);
  }

  const toolbar = (
    <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-1.5">
      <span className="text-[11px] text-faint">
        {running
          ? 'Checking project…'
          : hasRun
            ? `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`
            : 'Run a project check to see all problems'}
      </span>
      <button
        type="button"
        disabled={running || !rootPath}
        onClick={() => void useDiagnosticsStore.getState().run()}
        className="flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-fg disabled:opacity-40"
      >
        <RefreshCw size={12} className={cn(running && 'animate-spin')} />
        {hasRun ? 'Re-check' : 'Run check'}
      </button>
    </div>
  );

  // Before any project scan, fall back to live diagnostics from open files.
  const body = (): React.JSX.Element => {
    if (error) {
      return <EmptyState icon={TriangleAlert} title="Check failed" hint={error} />;
    }
    if (!hasRun) {
      if (markers.length === 0) {
        return (
          <EmptyState
            icon={CircleCheck}
            title="No problems in open files"
            hint="Run a project check above to scan the whole codebase."
          />
        );
      }
      return (
        <div className="h-full overflow-auto py-1">
          {markers.map((m) => {
            const tab = tabs.find((t) => t.path === m.path);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => tab && setActive(tab.path)}
                className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="mt-0.5 shrink-0">
                  <SeverityIcon severity={m.severity} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-muted">{m.message}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {m.file}:{m.line}:{m.col}
                    {m.code ? <span className="ml-2 font-mono">{m.code}</span> : null}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      );
    }
    if (diagnostics.length === 0) {
      return <EmptyState icon={CircleCheck} title="No problems detected" hint="Your project is clean." />;
    }
    return (
      <div className="h-full overflow-auto py-1">
        {[...groups.entries()].map(([file, list]) => {
          const isCollapsed = collapsed[file];
          return (
            <div key={file}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [file]: !c[file] }))}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-surface-2"
              >
                {isCollapsed ? (
                  <ChevronRight size={12} className="text-faint" />
                ) : (
                  <ChevronDown size={12} className="text-faint" />
                )}
                <ModernFileIcon name={basename(file)} />
                <span className="truncate text-[12px] font-medium text-muted">{basename(file)}</span>
                <span className="truncate text-[11px] text-faint">{file}</span>
                <span className="ml-auto shrink-0 rounded-full bg-surface-3 px-1.5 text-[10px] text-muted">
                  {list.length}
                </span>
              </button>
              {!isCollapsed
                ? list.map((d, i) => (
                    <button
                      key={`${file}:${d.line}:${d.col}:${i}`}
                      type="button"
                      onClick={() => openDiagnostic(d)}
                      className="flex w-full items-start gap-2.5 py-1 pl-8 pr-3 text-left hover:bg-surface-2"
                    >
                      <span className="mt-0.5 shrink-0">
                        <SeverityIcon severity={d.severity} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] leading-snug text-muted" title={d.message}>
                          {d.message}
                        </p>
                        <p className="mt-0.5 text-[11px] text-faint">
                          [Ln {d.line}, Col {d.col}] <span className="ml-1 font-mono">{d.code}</span>
                        </p>
                      </div>
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="min-h-0 flex-1">{body()}</div>
    </div>
  );
}
