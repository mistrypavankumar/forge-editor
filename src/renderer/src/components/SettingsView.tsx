import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, SlidersHorizontal, Wand2, Keyboard, Search, FolderSearch, Sparkles, HeartPulse, Check, Bug } from 'lucide-react';
import { useAiStore } from '../stores/ai-store';
import { useBrowserDebugStore } from '../browser/browser-debug-store';
import { useWellnessStore, WELLNESS_INTERVAL_MIN, WELLNESS_INTERVAL_MAX, WELLNESS_BREAK_MIN, WELLNESS_BREAK_MAX } from '../stores/wellness-store';
import { WELLNESS_EXERCISES } from '../lib/wellness-exercises';
import type { AiKeyStatus, AiProvider } from '@shared/ipc-contract';
import { useThemeStore } from '../stores/theme-store';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useLayoutStore } from '../stores/layout-store';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { commandRegistry } from '../commands/command-registry';
import { defaultKeybindings, eventToKeystroke, mergeKeybindings } from '../keybindings/keybinding-service';
import { builtInThemes } from '../theme/themes';
import { EDITOR_SCHEMES } from '../editor/editor-schemes';
import { FORMATTERS } from '../lib/detect-formatters';
import { cn } from '../lib/cn';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'formatting', label: 'Formatting', icon: Wand2 },
  { id: 'search', label: 'Search', icon: FolderSearch },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'browserDebug', label: 'Browser Debug', icon: Bug },
  { id: 'wellness', label: 'Wellness', icon: HeartPulse },
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
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}): React.JSX.Element {
  const btn = 'flex h-7 w-7 items-center justify-center text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30';
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-line bg-surface">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - step)} aria-label="Decrease">
        −
      </button>
      <span className="min-w-[52px] border-x border-line px-2 py-1 text-center font-mono text-[12px] text-fg">
        {value}
        {suffix}
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + step)} aria-label="Increase">
        +
      </button>
    </div>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-3', disabled && 'opacity-40')}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent disabled:cursor-not-allowed"
      />
      <span className="min-w-[40px] text-right font-mono text-[12px] text-fg">
        {Math.round(value * 100)}%
      </span>
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
  const editorScheme = useThemeStore((s) => s.editorScheme);
  const glass = useThemeStore((s) => s.glass);
  const glassOpacity = useThemeStore((s) => s.glassOpacity);
  const autoSave = useEditorStore((s) => s.autoSave);
  const fontSize = useEditorStore((s) => s.fontSize);
  const autoCheckProblems = useDiagnosticsStore((s) => s.autoRun);
  const selectedFormatter = useFormatterStore((s) => s.selectedId);
  const available = useFormatterStore((s) => s.available);
  const formatOnSave = useFormatterStore((s) => s.formatOnSave);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const overrides = useKeybindingsStore((s) => s.overrides);
  const searchExclude = useLayoutStore((s) => s.searchExclude);
  const aiProvider = useAiStore((s) => s.provider);
  const aiModel = useAiStore((s) => s.model);
  const wellnessEnabled = useWellnessStore((s) => s.enabled);
  const wellnessIntervalMin = useWellnessStore((s) => s.intervalMin);
  const wellnessBreakSec = useWellnessStore((s) => s.breakSec);
  const wellnessStrict = useWellnessStore((s) => s.strict);
  const wellnessExercises = useWellnessStore((s) => s.exercises);
  const wellnessSound = useWellnessStore((s) => s.sound);
  // Select only the preference fields (not the event arrays) so capture activity doesn't re-render Settings.
  const bdEnabled = useBrowserDebugStore((s) => s.enabled);
  const bdConfig = useBrowserDebugStore((s) => s.config);
  const bdRedact = useBrowserDebugStore((s) => s.redactSensitiveHeaders);
  const bdMaxEvents = useBrowserDebugStore((s) => s.maxEvents);
  const bdAllowExternal = useBrowserDebugStore((s) => s.allowExternalCapture);
  const [keyStatus, setKeyStatus] = useState<AiKeyStatus | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>('general');
  const [kbFilter, setKbFilter] = useState('');
  const [newExclude, setNewExclude] = useState('');
  const isMac = window.forge.isMac;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !recording) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, recording]);

  // Load which API providers have a saved key whenever Settings opens (keys themselves stay in main).
  useEffect(() => {
    if (!open) return;
    void window.forge.aiKeyStatus().then((r) => {
      if (r.ok) setKeyStatus(r.data);
    });
  }, [open]);

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
      <SettingRow label="Color theme" hint="Interface color scheme">
        <select value={themeId} onChange={(e) => useThemeStore.getState().setTheme(e.target.value)} className={selectCls}>
          {Object.values(builtInThemes).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Editor color scheme" hint="Syntax highlighting theme for the code editor">
        <select
          value={editorScheme}
          onChange={(e) => useThemeStore.getState().setEditorScheme(e.target.value)}
          className={selectCls}
        >
          {EDITOR_SCHEMES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </SettingRow>
      <SettingRow
        label="Window transparency"
        hint="Frosted glass — the blurred desktop shows through the interface (macOS)"
      >
        <Toggle on={glass} onChange={(v) => useThemeStore.getState().setGlass(v)} />
      </SettingRow>
      <SettingRow
        label="Background opacity"
        hint="Lower is more see-through; higher is more solid. Editor and terminal follow this too."
      >
        <Slider
          value={glassOpacity}
          min={0.1}
          max={1}
          step={0.05}
          disabled={!glass}
          onChange={(v) => useThemeStore.getState().setGlassOpacity(v)}
        />
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

  const addExclude = (): void => {
    const value = newExclude.trim().replace(/^[/\\]+|[/\\]+$/g, '');
    setNewExclude('');
    if (!value || searchExclude.includes(value)) return;
    useLayoutStore.getState().setSearchExclude([...searchExclude, value]);
  };
  const removeExclude = (folder: string): void => {
    useLayoutStore.getState().setSearchExclude(searchExclude.filter((f) => f !== folder));
  };

  const search = (
    <Card>
      <div className="px-4 py-4">
        <div className="text-[13px] font-medium text-fg">Excluded folders</div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-faint">
          Folder names skipped during global file search (quick open), on top of your{' '}
          <span className="font-mono">.gitignore</span>. Saved to{' '}
          <span className="font-mono">~/.forge/settings.json</span>.
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {searchExclude.length === 0 ? (
            <span className="text-[12px] text-faint">No extra folders excluded yet.</span>
          ) : (
            searchExclude.map((f) => (
              <span
                key={f}
                className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 font-mono text-[12px] text-fg"
              >
                {f}
                <button
                  type="button"
                  onClick={() => removeExclude(f)}
                  aria-label={`Remove ${f}`}
                  className="text-faint transition-colors hover:text-fg"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newExclude}
            onChange={(e) => setNewExclude(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExclude();
              }
            }}
            placeholder="e.g. .next, coverage, build"
            className="flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70"
          />
          <button
            type="button"
            onClick={addExclude}
            disabled={!newExclude.trim()}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-line-strong disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </Card>
  );

  const apiProvider: 'anthropic' | 'openai' | null =
    aiProvider === 'anthropic' || aiProvider === 'openai' ? aiProvider : null;
  const modelPlaceholder =
    aiProvider === 'anthropic'
      ? 'claude-sonnet-4-6 (default)'
      : aiProvider === 'openai'
        ? 'gpt-4o (default)'
        : 'uses your claude CLI default';
  const refreshKeyStatus = async (): Promise<void> => {
    const r = await window.forge.aiKeyStatus();
    if (r.ok) setKeyStatus(r.data);
  };
  const saveKey = async (): Promise<void> => {
    if (!apiProvider || !keyDraft.trim()) return;
    setKeySaving(true);
    const r = await window.forge.aiSetKey(apiProvider, keyDraft.trim());
    setKeySaving(false);
    if (r.ok) {
      setKeyDraft('');
      await refreshKeyStatus();
    }
  };
  const clearKey = async (): Promise<void> => {
    if (!apiProvider) return;
    await window.forge.aiSetKey(apiProvider, '');
    setKeyDraft('');
    await refreshKeyStatus();
  };
  const fieldCls =
    'w-60 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

  const bd = useBrowserDebugStore.getState();
  const browserDebug = (
    <div className="flex flex-col gap-4">
      <Card>
        <SettingRow label="Enable Browser Debug" hint="Capture console + network activity from the embedded browser. Data is kept in memory only.">
          <Toggle on={bdEnabled} onChange={bd.setEnabled} />
        </SettingRow>
        <SettingRow label="Capture console" hint="Console errors/warnings, uncaught errors, and unhandled rejections">
          <Toggle on={bdConfig.captureConsole} onChange={(v) => bd.setConfig({ captureConsole: v })} />
        </SettingRow>
        <SettingRow label="Capture network" hint="fetch / XHR requests made by the app" last>
          <Toggle on={bdConfig.captureNetwork} onChange={(v) => bd.setConfig({ captureNetwork: v })} />
        </SettingRow>
      </Card>
      <Card>
        <SettingRow label="Capture request bodies" hint="Store request payloads (up to the size limit below)">
          <Toggle on={bdConfig.captureRequestBodies} onChange={(v) => bd.setConfig({ captureRequestBodies: v })} />
        </SettingRow>
        <SettingRow label="Capture response bodies" hint="Store response previews (assets are always skipped)">
          <Toggle on={bdConfig.captureResponseBodies} onChange={(v) => bd.setConfig({ captureResponseBodies: v })} />
        </SettingRow>
        <SettingRow label="Max body size" hint="Bodies larger than this are truncated">
          <Stepper value={bdConfig.maxBodyKb} onChange={(v) => bd.setConfig({ maxBodyKb: v })} min={16} max={4096} step={16} suffix=" KB" />
        </SettingRow>
        <SettingRow label="Max events" hint="Oldest console/network events are dropped past this count" last>
          <Stepper value={bdMaxEvents} onChange={bd.setMaxEvents} min={50} max={5000} step={50} />
        </SettingRow>
      </Card>
      <Card>
        <SettingRow label="Redact sensitive headers" hint="Mask Authorization, Cookie, Set-Cookie, X-API-Key in displays and cURL">
          <Toggle on={bdRedact} onChange={bd.setRedactSensitiveHeaders} />
        </SettingRow>
        <SettingRow label="Capture external pages" hint="By default only localhost / private dev URLs are captured. Enable to capture any site." last>
          <Toggle on={bdAllowExternal} onChange={bd.setAllowExternalCapture} />
        </SettingRow>
      </Card>
    </div>
  );

  const ai = (
    <Card>
      <SettingRow label="AI provider" hint="Powers the Assistant panel and AI commit messages">
        <select
          value={aiProvider}
          onChange={(e) => {
            useAiStore.getState().setProvider(e.target.value as AiProvider);
            setKeyDraft('');
          }}
          className={selectCls}
        >
          <option value="claude-cli">Claude Code (CLI)</option>
          <option value="anthropic">Anthropic API</option>
          <option value="openai">OpenAI API</option>
        </select>
      </SettingRow>
      <SettingRow
        label="Model"
        hint={
          apiProvider
            ? "Leave blank to use the provider's default model"
            : 'Leave blank to use your `claude` CLI default model'
        }
        last={!apiProvider}
      >
        <input
          value={aiModel}
          onChange={(e) => useAiStore.getState().setModel(e.target.value)}
          placeholder={modelPlaceholder}
          className={fieldCls}
        />
      </SettingRow>
      {apiProvider ? (
        <SettingRow
          label="API key"
          hint={
            keyStatus?.[apiProvider]
              ? 'A key is saved (hidden). Enter a new one to replace it. Stored in ~/.forge/ai-credentials.'
              : 'Stored in ~/.forge/ai-credentials (0600), not in settings.json.'
          }
          last
        >
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={
                keyStatus?.[apiProvider]
                  ? '•••••••• saved'
                  : apiProvider === 'anthropic'
                    ? 'sk-ant-…'
                    : 'sk-…'
              }
              className={fieldCls}
            />
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={keySaving || !keyDraft.trim()}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-line-strong disabled:opacity-40"
            >
              Save
            </button>
            {keyStatus?.[apiProvider] ? (
              <button
                type="button"
                onClick={() => void clearKey()}
                aria-label="Clear API key"
                className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </SettingRow>
      ) : null}
    </Card>
  );

  const wellness = (
    <div className="space-y-5">
      <Card>
        <SettingRow
          label="Wellness breaks"
          hint="Periodic full-screen reminders to rest your eyes and stretch. Never interrupts while you're typing."
          last={!wellnessEnabled}
        >
          <Toggle on={wellnessEnabled} onChange={(v) => useWellnessStore.getState().setEnabled(v)} />
        </SettingRow>
        {wellnessEnabled ? (
          <>
            <SettingRow label="Remind me every" hint="Minutes of work between breaks">
              <Stepper
                value={wellnessIntervalMin}
                min={WELLNESS_INTERVAL_MIN}
                max={WELLNESS_INTERVAL_MAX}
                step={5}
                suffix=" min"
                onChange={(v) => useWellnessStore.getState().setIntervalMin(v)}
              />
            </SettingRow>
            <SettingRow label="Break length" hint="How long each break lasts">
              <Stepper
                value={wellnessBreakSec}
                min={WELLNESS_BREAK_MIN}
                max={WELLNESS_BREAK_MAX}
                step={5}
                suffix=" s"
                onChange={(v) => useWellnessStore.getState().setBreakSec(v)}
              />
            </SettingRow>
            <SettingRow
              label="Strict mode"
              hint="Wait out the full break — the only early exit is an “Emergency skip” button, for when you're mid-incident."
            >
              <Toggle on={wellnessStrict} onChange={(v) => useWellnessStore.getState().setStrict(v)} />
            </SettingRow>
            <SettingRow
              label="Chime"
              hint="Play a gentle chime when a break begins."
              last
            >
              <Toggle on={wellnessSound} onChange={(v) => useWellnessStore.getState().setSound(v)} />
            </SettingRow>
          </>
        ) : null}
      </Card>

      {wellnessEnabled ? (
        <Card>
          <div className="px-4 pt-3 pb-1">
            <div className="text-[13px] font-medium text-fg">Exercises in rotation</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-faint">
              One is shown per break, cycling through your selection. At least one stays on.
            </div>
          </div>
          <div className="px-2 pb-2">
            {WELLNESS_EXERCISES.map((ex) => {
              const on = wellnessExercises.includes(ex.id);
              const lastOn = on && wellnessExercises.length === 1;
              return (
                <button
                  key={ex.id}
                  type="button"
                  disabled={lastOn}
                  onClick={() => useWellnessStore.getState().toggleExercise(ex.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                    lastOn ? 'cursor-not-allowed' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                      on ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent',
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <ex.icon size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="text-[12.5px] text-fg">{ex.title}</span>
                    <span className="ml-2 text-[11px] text-faint">{ex.group}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end border-t border-line-soft px-4 py-3">
            <button
              type="button"
              onClick={() => useWellnessStore.getState().startBreak()}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-line-strong"
            >
              Preview a break
            </button>
          </div>
        </Card>
      ) : null}
    </div>
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
            {active === 'search' ? search : null}
            {active === 'ai' ? ai : null}
            {active === 'browserDebug' ? browserDebug : null}
            {active === 'wellness' ? wellness : null}
            {active === 'keyboard' ? keyboard : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
