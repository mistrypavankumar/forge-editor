import { ShieldAlert, ArrowUpRight } from 'lucide-react';
import { contextGroups, impactBeforeChange, type ImpactRisk } from '../data/context';
import { useEditorStore } from '../stores/editor-store';
import { SectionLabel } from './ui/Panel';
import { cn } from '../lib/cn';

const isFile = (label: string): boolean => label.includes('.');

const RISK_STYLE: Record<ImpactRisk, string> = {
  high: 'text-danger bg-danger/10',
  medium: 'text-warning bg-warning/10',
  low: 'text-success bg-success/10',
};

export function ContextPanel(): React.JSX.Element {
  const openFile = useEditorStore((s) => s.openFile);

  const open = (label: string, meta: string): void => {
    if (!isFile(label)) return;
    openFile({
      path: `/forge/${meta}/${label}`,
      name: label,
      content: `// ${label}\n// Opened from the Context panel (related file).\n`,
    });
  };

  return (
    <div className="h-full overflow-auto pb-4">
      {/* Impact before change */}
      <div className="mx-3 mt-3 rounded-lg border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg">
          <ShieldAlert size={14} className="text-warning" />
          Impact before change
        </div>
        <p className="mb-2.5 text-[11px] leading-relaxed text-faint">
          Refactoring this file may affect:
        </p>
        <div className="flex flex-col gap-1.5">
          {impactBeforeChange.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase',
                  RISK_STYLE[item.risk],
                )}
              >
                {item.risk}
              </span>
              <span className="truncate text-[12px] text-muted">{item.path}</span>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{item.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Relationship groups */}
      {contextGroups.map((group) => (
        <div key={group.title}>
          <SectionLabel>{group.title}</SectionLabel>
          {group.items.map((item) => {
            const file = isFile(item.label);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => open(item.label, item.meta)}
                className={cn(
                  'group flex h-7 w-full items-center gap-2 px-3 text-left text-[13px] text-muted',
                  file ? 'hover:bg-surface-2 hover:text-fg' : 'cursor-default',
                )}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto flex items-center gap-1 truncate text-[11px] text-faint">
                  {item.meta}
                  {file ? (
                    <ArrowUpRight
                      size={12}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
