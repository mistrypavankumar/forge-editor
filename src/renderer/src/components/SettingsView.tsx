import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw } from 'lucide-react';
import { useThemeStore } from '../stores/theme-store';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useLayoutStore } from '../stores/layout-store';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { commandRegistry } from '../commands/command-registry';
import { defaultKeybindings, eventToKeystroke, mergeKeybindings } from '../keybindings/keybinding-service';
import { builtInThemes } from '../theme/themes';
import { FORMATTERS } from '../lib/detect-formatters';
import { cn } from '../lib/cn';

/** Pretty-print a keystroke like `mod+shift+p` for display. */
function prettyKeystroke(ks: string, isMac: boolean): string {
  const map: Record<string, string> = isMac
    ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };
  return ks
    .split('+')
    .map((p) => map[p] ?? (p.length === 1 ? p.toUpperCase() : p.replace(/^arrow/, '')))
    .join(isMac ? '' : '+');
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-accent' : 'bg-surface-3')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-fg">{label}</span>
      {children}
    </div>
  );
}

export function SettingsView(): React.JSX.Element | null {
  const open = useLayoutStore((s) => s.settingsOpen);
  const close = (): void => useLayoutStore.getState().setSettingsOpen(false);
  const themeId = useThemeStore((s) => s.currentId);
  const autoSave = useEditorStore((s) => s.autoSave);
  const selectedFormatter = useFormatterStore((s) => s.selectedId);
  const available = useFormatterStore((s) => s.available);
  const formatOnSave = useFormatterStore((s) => s.formatOnSave);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const overrides = useKeybindingsStore((s) => s.overrides);
  const [recording, setRecording] = useState<string | null>(null);
  const isMac = window.forge.isMac;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !recording) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, recording]);

  // While recording, capture the next chord and bind it to the target command.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return; // wait for a real key
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const ks = eventToKeystroke(e, isMac);
      useKeybindingsStore.getState().setOverride(ks, recording);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, isMac]);

  if (!open) return null;

  const merged = mergeKeybindings(defaultKeybindings, overrides);
  const keystrokeFor = (id: string): string | undefined =>
    Object.keys(merged).find((ks) => merged[ks] === id);
  const isOverridden = (id: string): boolean => Object.values(overrides).includes(id);

  const commands = commandRegistry.all().filter((c) => c.id.length > 2).sort((a, b) =>
    (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title),
  );

  const setFormatter = (id: string): void => {
    const match = available.find((f) => f === id);
    if (match) useFormatterStore.getState().setSelected(match);
  };

  const selectCls =
    'rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-fg outline-none focus:border-accent/60';

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-start justify-center bg-black/40 pt-[8vh]" onMouseDown={close}>
      <div
        className="flex max-h-[80vh] w-[min(680px,92vw)] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold text-fg">Settings</h2>
          <button type="button" onClick={close} className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Editor</h3>
            <Row label="Color theme">
              <select value={themeId} onChange={(e) => useThemeStore.getState().setTheme(e.target.value)} className={selectCls}>
                {Object.values(builtInThemes).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Row>
            <Row label="Auto save">
              <Toggle on={autoSave} onChange={(v) => useEditorStore.getState().setAutoSave(v)} />
            </Row>
          </section>

          <section className="mt-4">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Formatting</h3>
            <Row label="Default formatter">
              <select value={selectedFormatter} onChange={(e) => setFormatter(e.target.value)} className={selectCls}>
                {available.map((id) => (
                  <option key={id} value={id}>{FORMATTERS[id].label}</option>
                ))}
              </select>
            </Row>
            <Row label="Format on save">
              <Toggle on={formatOnSave} onChange={(v) => useFormatterStore.getState().setFormatOnSave(v)} />
            </Row>
            <Row label="Auto format (5s after edits)">
              <Toggle on={autoFormat} onChange={(v) => useFormatterStore.getState().setAutoFormat(v)} />
            </Row>
          </section>

          <section className="mt-4">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Keyboard Shortcuts</h3>
            <div className="overflow-hidden rounded-md border border-line">
              {commands.map((cmd) => {
                const ks = keystrokeFor(cmd.id);
                return (
                  <div key={cmd.id} className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg">
                      {cmd.category ? <span className="text-faint">{cmd.category}: </span> : null}
                      {cmd.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecording(cmd.id)}
                      className={cn(
                        'min-w-[84px] rounded border px-2 py-0.5 text-center font-mono text-[11px]',
                        recording === cmd.id
                          ? 'border-accent text-accent'
                          : 'border-line bg-surface-2 text-muted hover:border-accent/60',
                      )}
                    >
                      {recording === cmd.id ? 'Press keys…' : ks ? prettyKeystroke(ks, isMac) : 'Unbound'}
                    </button>
                    {isOverridden(cmd.id) ? (
                      <button
                        type="button"
                        title="Reset to default"
                        onClick={() => {
                          for (const k of Object.keys(overrides)) {
                            if (overrides[k] === cmd.id) useKeybindingsStore.getState().removeOverride(k);
                          }
                        }}
                        className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
                      >
                        <RotateCcw size={12} />
                      </button>
                    ) : (
                      <span className="w-6" />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              Recording adds a shortcut (additive); the original may still work. Reset removes your override.
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
