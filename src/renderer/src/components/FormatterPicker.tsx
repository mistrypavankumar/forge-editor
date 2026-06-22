import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Wand2 } from 'lucide-react';
import { useFormatterStore } from '../stores/formatter-store';
import { FORMATTERS } from '../lib/detect-formatters';
import type { FormatterId } from '../lib/detect-formatters';
import { cn } from '../lib/cn';

interface FormatterPickerProps {
  /** Called with the chosen formatter; the caller sets it as default and formats. */
  onPick: (id: FormatterId) => void;
}

/** "Format Document With…" picker — a centered list of the available formatters. */
export function FormatterPicker({ onPick }: FormatterPickerProps): React.JSX.Element | null {
  const open = useFormatterStore((s) => s.pickerOpen);
  const available = useFormatterStore((s) => s.available);
  const selectedId = useFormatterStore((s) => s.selectedId);
  const close = (): void => useFormatterStore.getState().setPickerOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={close}
    >
      <div
        className="w-[min(520px,90vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-4 py-2.5 text-[12px] font-medium text-muted">
          Format Document With…
        </div>
        <ul className="max-h-[50vh] overflow-auto py-1">
          {available.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  onPick(id);
                  close();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-fg hover:bg-accent/15"
              >
                <Wand2 size={14} className="text-faint" />
                <span className="flex-1">{FORMATTERS[id].label}</span>
                {id === selectedId ? (
                  <span className="flex items-center gap-1 text-[11px] text-accent">
                    <Check size={13} /> default
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className={cn('border-t border-line px-4 py-2 text-[11px] text-faint')}>
          The chosen formatter becomes the default for this project.
        </div>
      </div>
    </div>,
    document.body,
  );
}
