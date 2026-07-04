import { ChevronRight, Eye, Pencil, Lock, Wand2 } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { FileTypeIcon } from './file-icon';
import { cn } from '../lib/cn';

/**
 * Beyond this many path segments the middle is collapsed into a single "…" crumb (always keeping
 * the workspace-root segment and the trailing folders + filename). Keeps deep paths from pushing
 * the toolbar off-screen while still showing where the file lives.
 */
const MAX_CRUMBS = 6;

interface Crumb {
  label: string;
  ellipsis?: boolean;
}

/** Build the crumb list: the complete path, with a deep middle folded into an ellipsis. */
function buildCrumbs(segments: string[]): Crumb[] {
  if (segments.length <= MAX_CRUMBS) return segments.map((label) => ({ label }));
  // Keep the first segment (repo root) + an ellipsis + the last (MAX_CRUMBS - 2) segments.
  return [
    { label: segments[0] },
    { label: '…', ellipsis: true },
    ...segments.slice(-(MAX_CRUMBS - 2)).map((label) => ({ label })),
  ];
}

export function Breadcrumbs({ groupId = 'main' }: { groupId?: string }): React.JSX.Element | null {
  const activePath = useEditorStore(
    (s) => (s.groups.find((g) => g.id === groupId) ?? s.groups[0])?.activePath ?? null,
  );
  const tabs = useEditorStore((s) => s.tabs);
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const toggleMdPreview = useEditorStore((s) => s.toggleMdPreview);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const setAutoFormat = useFormatterStore((s) => s.setAutoFormat);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const active = tabs.find((t) => t.path === activePath);
  if (!active || !activePath) return null;

  const isMarkdown = !active.readOnly && /\.mdx?$/i.test(active.name);
  const canFormat = !active.readOnly && active.original === undefined && activePath.startsWith('/');
  const fullPath = active.filePath ?? activePath;
  // Show the complete path relative to the workspace root (fall back to the raw path for files
  // outside the workspace, e.g. externally-opened ones).
  const relPath =
    rootPath && fullPath.startsWith(`${rootPath}/`) ? fullPath.slice(rootPath.length + 1) : fullPath;
  const segments = relPath.split('/').filter(Boolean);
  const crumbs = buildCrumbs(segments);

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-line-soft bg-bg px-3 text-[11px] text-faint">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" title={relPath}>
        {crumbs.map((crumb, i) => {
          const isFile = i === crumbs.length - 1;
          return (
            <span key={`p-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight size={12} className="shrink-0 opacity-50" /> : null}
              {crumb.ellipsis ? (
                <span className="shrink-0">{crumb.label}</span>
              ) : isFile ? (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
                  <FileTypeIcon name={crumb.label} />
                  <span className="truncate">{crumb.label}</span>
                  {active.readOnly ? <span className="shrink-0 text-faint">(Index)</span> : null}
                </span>
              ) : (
                <span className="truncate hover:text-muted">{crumb.label}</span>
              )}
            </span>
          );
        })}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        {active.readOnly ? (
          <span
            title="This file is read-only (staged version). Use “Open File” to edit."
            className="flex items-center gap-1 text-faint"
          >
            <Lock size={12} /> Read-only
          </span>
        ) : null}
        {canFormat ? (
          <button
            type="button"
            onClick={() => setAutoFormat(!autoFormat)}
            aria-pressed={autoFormat}
            title={
              autoFormat
                ? 'Auto Format on — formats 5s after you stop editing. Click to turn off.'
                : 'Auto Format off — click to format automatically 5s after edits stop.'
            }
            className={cn(
              'no-drag flex h-6 items-center gap-1 rounded-md px-2 text-[11px] hover:bg-surface-3',
              autoFormat ? 'text-accent' : 'text-faint hover:text-fg',
            )}
          >
            <Wand2 size={13} />
            Auto Format
          </button>
        ) : null}
        {isMarkdown ? (
          <button
            type="button"
            onClick={toggleMdPreview}
            title={mdPreview ? 'Edit (show source)' : 'Preview (rendered)'}
            className="no-drag flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-faint hover:bg-surface-3 hover:text-fg"
          >
            {mdPreview ? <Pencil size={13} /> : <Eye size={13} />}
            {mdPreview ? 'Edit' : 'Preview'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

