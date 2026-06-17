import { ChevronRight, Box, Hash } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { FileTypeIcon } from './file-icon';
import { SAMPLE_FILE_PATH, SAMPLE_SYMBOLS } from '../data/sample-code';

export function Breadcrumbs(): React.JSX.Element | null {
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);
  if (!active || !activePath) return null;

  const segments = activePath.split('/').filter(Boolean);
  const pathCrumbs = segments.slice(-4);
  const symbols = activePath === SAMPLE_FILE_PATH ? SAMPLE_SYMBOLS : [];

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line-soft bg-bg px-3 text-[11px] text-faint">
      {pathCrumbs.map((seg, i) => {
        const isFile = i === pathCrumbs.length - 1;
        return (
          <span key={`p-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight size={12} className="opacity-50" /> : null}
            {isFile ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <FileTypeIcon name={seg} />
                {seg}
              </span>
            ) : (
              <span className="hover:text-muted">{seg}</span>
            )}
          </span>
        );
      })}
      {symbols.map((sym, i) => (
        <span key={`s-${i}`} className="flex items-center gap-1">
          <ChevronRight size={12} className="opacity-50" />
          <span className="inline-flex items-center gap-1 text-muted">
            {i === 0 ? (
              <Box size={11} className="text-info" />
            ) : (
              <Hash size={11} className="text-accent" />
            )}
            {sym}
          </span>
        </span>
      ))}
    </div>
  );
}
