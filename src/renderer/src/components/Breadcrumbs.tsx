import { ChevronRight, Eye, Pencil, Lock, Wand2 } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { FileTypeIcon } from './file-icon';
import { cn } from '../lib/cn';

export function Breadcrumbs(): React.JSX.Element | null {
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const toggleMdPreview = useEditorStore((s) => s.toggleMdPreview);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const setAutoFormat = useFormatterStore((s) => s.setAutoFormat);
  const active = tabs.find((t) => t.path === activePath);
  if (!active || !activePath) return null;

  const isMarkdown = !active.readOnly && /\.mdx?$/i.test(active.name);
  const canFormat = !active.readOnly && active.original === undefined && activePath.startsWith('/');
  const displayPath = active.filePath ?? activePath;
  const segments = displayPath.split('/').filter(Boolean);
  const crumbs = segments.slice(-4);

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line-soft bg-bg px-3 text-[11px] text-faint">
      {crumbs.map((seg, i) => {
        const isFile = i === crumbs.length - 1;
        return (
          <span key={`p-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight size={12} className="opacity-50" /> : null}
            {isFile ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <FileTypeIcon name={seg} />
                {seg}
                {active.readOnly ? <span className="text-faint">(Index)</span> : null}
              </span>
            ) : (
              <span className="hover:text-muted">{seg}</span>
            )}
          </span>
        );
      })}
      <div className="ml-auto flex items-center gap-1">
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

