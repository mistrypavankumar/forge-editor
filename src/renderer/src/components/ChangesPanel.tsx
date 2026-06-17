import { GitCommitVertical, Sparkles } from 'lucide-react';
import {
  fileChanges,
  sampleDiff,
  commitSuggestion,
  changeSummary,
  type ChangeStatus,
} from '../data/changes';
import { FileTypeIcon } from './file-icon';
import { cn } from '../lib/cn';

const STATUS_BADGE: Record<ChangeStatus, { letter: string; cls: string }> = {
  modified: { letter: 'M', cls: 'text-warning' },
  added: { letter: 'A', cls: 'text-success' },
  deleted: { letter: 'D', cls: 'text-danger' },
  renamed: { letter: 'R', cls: 'text-info' },
};

export function ChangesPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      {/* Summary */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-3 py-2 text-[11px] text-faint">
        <span>{changeSummary.files} files</span>
        <span className="text-success">+{changeSummary.additions}</span>
        <span className="text-danger">−{changeSummary.deletions}</span>
      </div>

      {/* Changed files */}
      <div className="max-h-44 shrink-0 overflow-auto py-1">
        {fileChanges.map((c) => {
          const badge = STATUS_BADGE[c.status];
          return (
            <div
              key={c.id}
              className="flex h-7 items-center gap-2 px-3 text-[13px] text-muted hover:bg-surface-3"
            >
              <FileTypeIcon name={c.name} />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                <span className="text-success">+{c.additions}</span>
                <span className="text-danger">−{c.deletions}</span>
                <span className={cn('w-3 text-center font-semibold', badge.cls)}>
                  {badge.letter}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Diff preview */}
      <div className="min-h-0 flex-1 overflow-auto border-t border-line-soft">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          user-service.ts
        </div>
        <pre className="px-2 pb-3 font-mono text-[12px] leading-5">
          {sampleDiff.map((line, i) => (
            <div
              key={i}
              className={cn(
                'px-2',
                line.kind === 'add' && 'bg-success/10 text-success',
                line.kind === 'del' && 'bg-danger/10 text-danger',
                line.kind === 'ctx' && 'text-faint',
              )}
            >
              <span className="mr-2 select-none opacity-60">
                {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>

      {/* Commit suggestion */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-faint">
          <Sparkles size={12} className="text-accent" />
          Suggested commit message
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] text-fg">
          {commitSuggestion}
        </div>
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          <GitCommitVertical size={14} />
          Commit 4 files
        </button>
      </div>
    </div>
  );
}
