import { useState } from 'react';
import {
  CircleX, TriangleAlert, Info, CircleCheck, RefreshCw, ChevronDown, ChevronRight, Copy, Check,
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

// Hover-revealed button that copies the problem text plus its file location to the clipboard.
function CopyProblemButton({ text, copyKey }: { text: string; copyKey: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy problem and file"
      aria-label="Copy problem and file"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn(
        'shrink-0 rounded p-1 text-faint opacity-0 transition-opacity hover:bg-surface-3 hover:text-fg group-hover:opacity-100',
        copied && 'opacity-100',
      )}
      data-copy-key={copyKey}
    >
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  );
}

export function ProblemList(): React.JSX.Element {
  const markers = useWorkbenchStatusStore((s) => s.markers);
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const running = useDiagnosticsStore((s) => s.running);
  const hasRun = useDiagnosticsStore((s) => s.hasRun);
  const error = useDiagnosticsStore((s) => s.error);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const requestReveal = useEditorStore((s) => s.requestReveal);
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

  // Live marker from an open file — its `path` is already the absolute file path.
  // Open (or re-focus) the file, then jump the cursor to the marker's line/column.
  const openMarker = (path: string, file: string, line: number, col: number): void => {
    void openFilePath(path, file).then(() => requestReveal({ path, line, col }));
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
            const location = `${m.file}:${m.line}:${m.col}`;
            const copyText = `${m.message}${m.code ? ` (${m.code})` : ''}\n${location}`;
            return (
              <div key={m.id} className="group flex items-start hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => openMarker(m.path, m.file, m.line, m.col)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 py-1.5 pl-3 text-left"
                >
                  <span className="mt-0.5 shrink-0">
                    <SeverityIcon severity={m.severity} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-muted">{m.message}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {location}
                      {m.code ? <span className="ml-2 font-mono">{m.code}</span> : null}
                    </p>
                  </div>
                </button>
                <div className="mt-1 pr-2">
                  <CopyProblemButton text={copyText} copyKey={m.id} />
                </div>
              </div>
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
                ? list.map((d, i) => {
                    const copyText = `${d.message}${d.code ? ` (${d.code})` : ''}\n${d.file}:${d.line}:${d.col}`;
                    return (
                      <div
                        key={`${file}:${d.line}:${d.col}:${i}`}
                        className="group flex items-start hover:bg-surface-2"
                      >
                        <button
                          type="button"
                          onClick={() => openDiagnostic(d)}
                          className="flex min-w-0 flex-1 items-start gap-2.5 py-1 pl-8 text-left"
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
                        <div className="mt-1 pr-2">
                          <CopyProblemButton text={copyText} copyKey={`${file}:${d.line}:${d.col}:${i}`} />
                        </div>
                      </div>
                    );
                  })
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
