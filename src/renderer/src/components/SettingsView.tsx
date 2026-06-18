import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, SlidersHorizontal, Wand2, Keyboard, Search } from 'lucide-react';
import { useThemeStore } from '../stores/theme-store';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useLayoutStore } from '../stores/layout-store';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { commandRegistry } from '../commands/command-registry';
import { defaultKeybindings, eventToKeystroke, mergeKeybindings } from '../keybindings/keybinding-service';
import { builtInThemes } from '../theme/themes';
import { FORMATTERS } from '../lib/detect-formatters';
import { cn } from '../lib/cn';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'formatting', label: 'Formatting', icon: Wand2 },
  { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Keyboard },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** Split a keystroke like `mod+shift+p` into display tokens for individual key-caps. */
function keyTokens(ks: string, isMac: boolean): string[] {
  const map: Record<string, string> = isMac
    ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };
  const keyMap: Record<string, string> = {
    arrowright: '→', arrowleft: '←', arrowup: '↑', arrowdown: '↓', ' ': 'Space', '`': '`',
  };
  return ks.split('+').map((p) => map[p] ?? keyMap[p] ?? (p.length === 1 ? p.toUpperCase() : p));
}

function Keycaps({ ks, isMac }: { ks: string; isMac: boolean }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1">
      {keyTokens(ks, isMac).map((t, i) => (
        <kbd
          key={i}
          className="min-w-[20px] rounded-[5px] border border-line-strong bg-surface px-1.5 py-0.5 text-center font-mono text-[11px] leading-none text-muted shadow-[0_1px_0_rgba(0,0,0,0.4)]"
        >
          {t}
        </kbd>
      ))}
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
        on ? 'bg-accent' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150',
          on ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

const selectCls =
  'cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg outline-none transition-colors hover:border-line-strong focus:border-accent/70';

function Stepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}): React.JSX.Element {
  const btn = 'flex h-7 w-7 items-center justify-center text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30';
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-line bg-surface">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Decrease">
        −
      </button>
      <span className="min-w-[52px] border-x border-line px-2 py-1 text-center font-mono text-[12px] text-fg">
        {value}
        {suffix}
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Increase">
        +
      </button>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
  last,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  last?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center justify-between gap-6 px-4 py-3', !last && 'border-b border-line-soft')}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{label}</div>
        {hint ? <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="overflow-hidden rounded-xl border border-line bg-surface-2/40">{children}</div>;
}

export function SettingsView(): React.JSX.Element | null {
  const open = useLayoutStore((s) => s.settingsOpen);
  const close = (): void => useLayoutStore.getState().setSettingsOpen(false);
  const themeId = useThemeStore((s) => s.currentId);
  const autoSave = useEditorStore((s) => s.autoSave);
  const fontSize = useEditorStore((s) => s.fontSize);
  const autoCheckProblems = useDiagnosticsStore((s) => s.autoRun);
  const selectedFormatter = useFormatterStore((s) => s.selectedId);
  const available = useFormatterStore((s) => s.available);
  const formatOnSave = useFormatterStore((s) => s.formatOnSave);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const overrides = useKeybindingsStore((s) => s.overrides);
  const [recording, setRecording] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>('general');
  const [kbFilter, setKbFilter] = useState('');
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
      if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return;
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      useKeybindingsStore.getState().setOverride(eventToKeystroke(e, isMac), recording);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, isMac]);

  if (!open) return null;

  const merged = mergeKeybindings(defaultKeybindings, overrides);
  const keystrokeFor = (id: string): string | undefined => Object.keys(merged).find((ks) => merged[ks] === id);
  const isOverridden = (id: string): boolean => Object.values(overrides).includes(id);

  const commands = commandRegistry
    .all()
    .filter((c) => c.id.length > 2)
    .filter((c) => {
      const q = kbFilter.trim().toLowerCase();
      return !q || `${c.category ?? ''} ${c.title}`.toLowerCase().includes(q);
    })
    .sort(
      (a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title),
    );

  const setFormatter = (id: string): void => {
    const match = available.find((f) => f === id);
    if (match) useFormatterStore.getState().setSelected(match);
  };

  const activeLabel = SECTIONS.find((s) => s.id === active)?.label ?? '';

  const general = (
    <Card>
      <SettingRow label="Color theme" hint="Editor and interface color scheme">
        <select value={themeId} onChange={(e) => useThemeStore.getState().setTheme(e.target.value)} className={selectCls}>
          {Object.values(builtInThemes).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Font size" hint="Editor font size in pixels">
        <Stepper
          value={fontSize}
          min={8}
          max={32}
          suffix="px"
          onChange={(v) => useEditorStore.getState().setFontSize(v)}
        />
      </SettingRow>
      <SettingRow label="Auto save" hint="Write changes to disk when the editor loses focus">
        <Toggle on={autoSave} onChange={(v) => useEditorStore.getState().setAutoSave(v)} />
      </SettingRow>
      <SettingRow label="Auto-check problems" hint="Re-run a project-wide type-check after changes (can be slow on large repos)" last>
        <Toggle on={autoCheckProblems} onChange={(v) => useDiagnosticsStore.getState().setAutoRun(v)} />
      </SettingRow>
    </Card>
  );

  const formatting = (
    <Card>
      <SettingRow label="Default formatter" hint="Used by Format Document and on save">
        <select value={selectedFormatter} onChange={(e) => setFormatter(e.target.value)} className={selectCls}>
          {available.map((id) => (
            <option key={id} value={id}>{FORMATTERS[id].label}</option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Format on save" hint="Run the default formatter every time a file is saved">
        <Toggle on={formatOnSave} onChange={(v) => useFormatterStore.getState().setFormatOnSave(v)} />
      </SettingRow>
      <SettingRow label="Auto format" hint="Format automatically 5 seconds after edits stop" last>
        <Toggle on={autoFormat} onChange={(v) => useFormatterStore.getState().setAutoFormat(v)} />
      </SettingRow>
    </Card>
  );

  const keyboard = (
    <>
      <div className="mb-3 flex items-center justify-end">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 focus-within:border-accent/70">
          <Search size={12} className="text-faint" />
          <input
            value={kbFilter}
            onChange={(e) => setKbFilter(e.target.value)}
            placeholder="Filter…"
            className="w-40 bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>
      <Card>
        {commands.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-faint">No matching commands.</p>
        ) : null}
        {commands.map((cmd, i) => {
          const ks = keystrokeFor(cmd.id);
          return (
            <div
              key={cmd.id}
              className={cn('group flex items-center gap-3 px-4 py-2', i < commands.length - 1 && 'border-b border-line-soft')}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                {cmd.category ? <span className="text-faint">{cmd.category} · </span> : null}
                {cmd.title}
              </span>
              {isOverridden(cmd.id) ? (
                <button
                  type="button"
                  title="Reset to default"
                  onClick={() => {
                    for (const k of Object.keys(overrides)) {
                      if (overrides[k] === cmd.id) useKeybindingsStore.getState().removeOverride(k);
                    }
                  }}
                  className="rounded p-1 text-faint opacity-0 transition-opacity hover:bg-surface-3 hover:text-fg group-hover:opacity-100"
                >
                  <RotateCcw size={12} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setRecording(cmd.id)}
                className={cn(
                  'flex h-7 min-w-[92px] items-center justify-center rounded-lg border px-2 transition-colors',
                  recording === cmd.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-transparent hover:border-line hover:bg-surface',
                )}
              >
                {recording === cmd.id ? (
                  <span className="text-[11px] text-accent">Press keys…</span>
                ) : ks ? (
                  <Keycaps ks={ks} isMac={isMac} />
                ) : (
                  <span className="text-[11px] text-faint">Unbound</span>
                )}
              </button>
            </div>
          );
        })}
      </Card>
      <p className="mt-2 px-1 text-[11px] text-faint">
        Recording adds a shortcut; the original may still work. Use reset to remove your override.
      </p>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm" onMouseDown={close}>
      <div
        className="flex h-[78vh] max-h-[760px] w-[min(900px,92vw)] overflow-hidden rounded-2xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Section nav */}
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-line bg-surface/50 p-3">
          <div className="px-2 pb-3 pt-1 text-[15px] font-semibold tracking-tight text-fg">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                active === s.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
            <h2 className="text-[14px] font-semibold tracking-tight text-fg">{activeLabel}</h2>
            <button type="button" onClick={close} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg">
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {active === 'general' ? general : null}
            {active === 'formatting' ? formatting : null}
            {active === 'keyboard' ? keyboard : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
