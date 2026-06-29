import { create } from 'zustand';
import type {
  DebugConfig,
  DebugStackFrame,
  DebugStatus,
  SourceBreakpoint,
} from '@shared/ipc-contract';
import { useEditorStore } from './editor-store';
import { useWorkspaceStore } from './workspace-store';
import { useLayoutStore } from './layout-store';
import { openFilePath } from '../lib/workspace-actions';

export interface DebugOutputLine {
  id: number;
  /** 'eval' = a REPL result, 'system' = a Forge status note. */
  category: 'stdout' | 'stderr' | 'console' | 'eval' | 'system';
  text: string;
}

/** The always-present built-in: debug whatever file is focused in the editor. */
const CURRENT_FILE_CONFIG: DebugConfig = {
  id: 'file',
  name: 'Debug current file',
  kind: 'file',
};

let outSeq = 0;

interface DebugStore {
  status: DebugStatus;
  /** Absolute file path → sorted 1-based breakpoint lines. */
  breakpoints: Record<string, number[]>;
  /** Lines the backend confirmed it bound (per file), for dimming unverified breakpoints. */
  verified: Record<string, number[]>;
  frames: DebugStackFrame[];
  activeFrameId: string | null;
  /** Where execution is paused (drives the editor's current-line highlight), or null when running. */
  pausedLocation: { file: string; line: number } | null;
  output: DebugOutputLine[];
  configs: DebugConfig[];
  activeConfigId: string;

  toggleBreakpoint: (file: string, line: number) => void;
  breakpointsFor: (file: string) => number[];
  setActiveConfig: (id: string) => void;
  loadConfigs: () => Promise<void>;

  start: () => Promise<void>;
  stop: () => void;
  resume: () => void;
  pause: () => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  selectFrame: (id: string) => void;
  evaluate: (expression: string) => Promise<void>;
  clearOutput: () => void;
}

function persistBreakpoints(breakpoints: Record<string, number[]>): void {
  // saveSettings merges, so writing just `breakpoints` leaves every other setting untouched.
  void window.forge.saveSettings({ breakpoints });
}

function appendOutput(
  state: DebugStore,
  category: DebugOutputLine['category'],
  text: string,
): Partial<DebugStore> {
  return { output: [...state.output, { id: ++outSeq, category, text }] };
}

export const useDebugStore = create<DebugStore>((set, get) => ({
  status: 'inactive',
  breakpoints: {},
  verified: {},
  frames: [],
  activeFrameId: null,
  pausedLocation: null,
  output: [],
  configs: [CURRENT_FILE_CONFIG],
  activeConfigId: 'file',

  toggleBreakpoint: (file, line) => {
    const current = get().breakpoints[file] ?? [];
    const next = current.includes(line)
      ? current.filter((l) => l !== line)
      : [...current, line].sort((a, b) => a - b);
    const breakpoints = { ...get().breakpoints };
    if (next.length) breakpoints[file] = next;
    else delete breakpoints[file];
    set({ breakpoints });
    persistBreakpoints(breakpoints);
    // Push the change to a live session so it takes effect without a restart.
    if (get().status !== 'inactive' && get().status !== 'terminated') {
      void window.forge.debug.setBreakpoints(file, next).then((res) => {
        if (!res.ok) return;
        set((s) => ({ verified: { ...s.verified, [file]: res.data.filter((b) => b.verified).map((b) => b.line) } }));
      });
    }
  },

  breakpointsFor: (file) => get().breakpoints[file] ?? [],

  setActiveConfig: (id) => set({ activeConfigId: id }),

  loadConfigs: async () => {
    const root = useWorkspaceStore.getState().rootPath;
    const configs: DebugConfig[] = [CURRENT_FILE_CONFIG];
    if (root) {
      const res = await window.forge.readFile(`${root}/.forge/launch.json`);
      if (res.ok) {
        try {
          const parsed = JSON.parse(res.data) as { configurations?: DebugConfig[] } | DebugConfig[];
          const list = Array.isArray(parsed) ? parsed : (parsed.configurations ?? []);
          for (const c of list) {
            if (c && c.id && c.name) configs.push({ ...c, kind: c.kind ?? 'custom' });
          }
        } catch {
          // malformed launch.json — fall back to the built-in only
        }
      }
    }
    const activeConfigId = configs.some((c) => c.id === get().activeConfigId)
      ? get().activeConfigId
      : 'file';
    set({ configs, activeConfigId });
  },

  start: async () => {
    const { configs, activeConfigId, breakpoints } = get();
    const config = configs.find((c) => c.id === activeConfigId) ?? CURRENT_FILE_CONFIG;
    const root = useWorkspaceStore.getState().rootPath ?? undefined;
    const resolved: DebugConfig = { ...config, cwd: config.cwd ?? root };
    if (config.kind === 'file') {
      const active = useEditorStore.getState().activePath;
      if (!active) {
        set((s) => appendOutput(s, 'system', 'Open a file to debug, then press F5.\n'));
        return;
      }
      resolved.program = active;
    }
    if (!resolved.program) {
      set((s) => appendOutput(s, 'system', `Configuration "${config.name}" has no program to run.\n`));
      return;
    }

    // Surface the Debug Console for the run.
    useLayoutStore.getState().setBottomTab('debug');
    useLayoutStore.getState().setPanelVisible('bottom', true);
    set((s) => ({
      ...appendOutput(s, 'system', `Starting ${resolved.program}…\n`),
      status: 'starting',
      frames: [],
      activeFrameId: null,
      pausedLocation: null,
    }));

    const flat: SourceBreakpoint[] = Object.entries(breakpoints).flatMap(([file, lines]) =>
      lines.map((line) => ({ file, line })),
    );
    const res = await window.forge.debug.start(resolved, flat);
    if (!res.ok) {
      set((s) => ({ ...appendOutput(s, 'stderr', `${res.error}\n`), status: 'terminated' }));
    }
  },

  stop: () => {
    void window.forge.debug.stop();
  },
  resume: () => window.forge.debug.resume(),
  pause: () => window.forge.debug.pause(),
  stepOver: () => window.forge.debug.stepOver(),
  stepInto: () => window.forge.debug.stepInto(),
  stepOut: () => window.forge.debug.stepOut(),

  selectFrame: (id) => {
    const frame = get().frames.find((f) => f.id === id);
    set({
      activeFrameId: id,
      pausedLocation: frame?.file ? { file: frame.file, line: frame.line } : get().pausedLocation,
    });
    if (frame?.file) void openFilePath(frame.file);
  },

  evaluate: async (expression) => {
    const trimmed = expression.trim();
    if (!trimmed) return;
    set((s) => appendOutput(s, 'eval', `> ${trimmed}\n`));
    const frameId = get().activeFrameId ?? undefined;
    const res = await window.forge.debug.evaluate(trimmed, frameId);
    set((s) => appendOutput(s, res.ok ? 'eval' : 'stderr', `${res.ok ? res.data : res.error}\n`));
  },

  clearOutput: () => set({ output: [] }),
}));

/**
 * Bind the main-process debug session's events into the store. Called once at app start. Also
 * restores persisted breakpoints from settings.
 */
export function initDebugStore(): () => void {
  void window.forge.loadSettings().then((res) => {
    if (res.ok && res.data.breakpoints) useDebugStore.setState({ breakpoints: res.data.breakpoints });
  });

  const offState = window.forge.debug.onState((e) => {
    useDebugStore.setState((s) => {
      if (e.status === 'terminated') {
        return {
          status: 'terminated',
          frames: [],
          activeFrameId: null,
          pausedLocation: null,
          ...(e.reason ? appendOutput(s, 'stderr', `${e.reason}\n`) : {}),
        };
      }
      return { status: e.status };
    });
  });

  const offStopped = window.forge.debug.onStopped((e) => {
    const top = e.frames.find((f) => f.file) ?? e.frames[0] ?? null;
    useDebugStore.setState({
      status: 'paused',
      frames: e.frames,
      activeFrameId: top?.id ?? null,
      pausedLocation: e.topFile ? { file: e.topFile, line: e.topLine } : null,
    });
    if (e.topFile) void openFilePath(e.topFile);
  });

  const offOutput = window.forge.debug.onOutput((e) => {
    useDebugStore.setState((s) => appendOutput(s, e.category, e.text));
  });

  return () => {
    offState();
    offStopped();
    offOutput();
  };
}
