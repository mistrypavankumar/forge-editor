import { useRef, useState } from 'react';
import { Wand2, AlertTriangle } from 'lucide-react';
import { useFormatterStore } from '../stores/formatter-store';
import { useEditorStore } from '../stores/editor-store';
import { FORMATTERS } from '../lib/detect-formatters';
import { formatActiveFile } from '../lib/format-actions';
import { ContextMenu, type MenuItem } from './ui/ContextMenu';
import { cn } from '../lib/cn';

/** Status-bar control: shows the active formatter and opens a menu to switch it / format the file. */
export function FormatterSegment(): React.JSX.Element {
  const selectedId = useFormatterStore((s) => s.selectedId);
  const available = useFormatterStore((s) => s.available);
  const formatOnSave = useFormatterStore((s) => s.formatOnSave);
  const lastError = useFormatterStore((s) => s.lastError);
  const activePath = useEditorStore((s) => s.activePath);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (): void => {
    const r = btnRef.current?.getBoundingClientRect();
    // Anchor the menu's bottom-left to the button; ContextMenu flips it upward near the screen edge.
    if (r) setMenu({ x: r.left, y: r.top });
  };

  const items: MenuItem[] = [
    ...available.map((id) => ({
      label: FORMATTERS[id].label,
      checked: id === selectedId,
      onSelect: () => useFormatterStore.getState().setSelected(id),
    })),
    {
      label: `Format on Save: ${formatOnSave ? 'On' : 'Off'}`,
      checked: formatOnSave,
      dividerAfter: true,
      onSelect: () => useFormatterStore.getState().setFormatOnSave(!formatOnSave),
    },
    {
      label: 'Format Document',
      onSelect: () => {
        if (activePath) void formatActiveFile();
      },
    },
  ];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        title={lastError ? `Formatter error: ${lastError}` : 'Select formatter'}
        className={cn(
          'flex h-full items-center gap-1.5 px-2.5 text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-fg',
          lastError && 'text-danger',
        )}
      >
        {lastError ? <AlertTriangle size={12} /> : <Wand2 size={12} />}
        {FORMATTERS[selectedId].label}
      </button>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
    </>
  );
}
