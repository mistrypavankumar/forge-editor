import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  checked?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  useEffect(() => {
    const close = (): void => onClose();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[2000] min-w-56 overflow-hidden rounded-lg border border-line bg-surface-2 py-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-accent/15"
        >
          <span className="flex w-3.5 justify-center text-accent">
            {item.checked ? <Check size={13} /> : null}
          </span>
          <span className={cn(item.checked && 'text-accent')}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
