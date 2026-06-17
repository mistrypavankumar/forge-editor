import { ShieldAlert } from 'lucide-react';
import { contextGroups, impactBeforeChange, type ImpactRisk } from '../data/context';
import { SectionLabel } from './ui/Panel';
import { cn } from '../lib/cn';

const RISK_STYLE: Record<ImpactRisk, string> = {
  high: 'text-danger bg-danger/10',
  medium: 'text-warning bg-warning/10',
  low: 'text-success bg-success/10',
};

export function ContextPanel(): React.JSX.Element {
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
          {group.items.map((item) => (
            <div
              key={item.id}
              className="flex h-7 items-center gap-2 px-3 text-[13px] text-muted hover:bg-surface-3"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-faint" />
              <span className="truncate">{item.label}</span>
              <span className="ml-auto truncate text-[11px] text-faint">{item.meta}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
