import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  size?: 'sm' | 'md';
}

export function Tabs({ items, active, onSelect, size = 'md' }: TabsProps): React.JSX.Element {
  return (
    <div className="flex items-stretch gap-0.5">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              isActive ? 'text-fg' : 'text-faint hover:text-muted',
            )}
          >
            {item.label}
            {typeof item.badge === 'number' && item.badge > 0 ? (
              <span className="rounded-full bg-surface-3 px-1.5 text-[10px] leading-4 text-muted">
                {item.badge}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
