import { create } from 'zustand';
import type {
  BrowserConsoleEvent,
  BrowserNetworkEvent,
  BrowserDebugConfig,
  BrowserDebugSettings,
} from '@shared/ipc-contract';

/**
 * In-memory store for the Browser Debug panel: console/error events and network requests captured
 * from the embedded browser's guest page. Data is intentionally NOT persisted — it's local,
 * ephemeral debug data (bodies especially, per the security requirements). A ring-buffer cap keeps
 * memory bounded; GraphQL events are derived on demand from the network list (see network.ts), not
 * stored separately.
 */

export type ConsoleFilter = 'all' | 'error' | 'warning' | 'info';

/** Default capture config; mirrors the documented `browserDebug.*` setting defaults. */
export const DEFAULT_DEBUG_CONFIG: BrowserDebugConfig = {
  captureConsole: true,
  captureNetwork: true,
  captureRequestBodies: true,
  captureResponseBodies: true,
  maxBodyKb: 512,
};

/** Default retained events per stream (oldest dropped first); user-overridable via settings. */
export const DEFAULT_MAX_EVENTS = 500;

/** A stable signature for "ignore similar" — same level + normalized message (digits stripped). */
export function consoleSignature(e: Pick<BrowserConsoleEvent, 'level' | 'message'>): string {
  return `${e.level}::${e.message.replace(/\d+/g, '#').slice(0, 200)}`;
}

interface BrowserDebugState {
  /** Master switch: when off, nothing is captured (guest capture is disabled too). */
  enabled: boolean;
  config: BrowserDebugConfig;
  /** Redact sensitive headers (Authorization, Cookie, …) in displays and cURL by default. */
  redactSensitiveHeaders: boolean;
  /** Retained events per stream. */
  maxEvents: number;
  /** Capture from non-local (non-localhost/private) pages. Off by default for privacy. */
  allowExternalCapture: boolean;
  console: BrowserConsoleEvent[];
  network: BrowserNetworkEvent[];
  /** Signatures the user chose to hide via "Ignore Similar Errors". */
  ignored: string[];
  selectedConsoleId: string | null;
  selectedNetworkId: string | null;
  consoleFilter: ConsoleFilter;
  /** Only show events whose routePath matches the current browser route. */
  currentRouteOnly: boolean;
  hideIgnored: boolean;

  setEnabled: (on: boolean) => void;
  setConfig: (patch: Partial<BrowserDebugConfig>) => void;
  setRedactSensitiveHeaders: (on: boolean) => void;
  setMaxEvents: (n: number) => void;
  setAllowExternalCapture: (on: boolean) => void;
  /** Hydrate persisted settings (from ForgeSettings) into the store. */
  applySettings: (s: Partial<BrowserDebugSettings>) => void;
  addConsole: (e: BrowserConsoleEvent) => void;
  addNetwork: (e: BrowserNetworkEvent) => void;
  clearConsole: () => void;
  clearNetwork: () => void;
  clearAll: () => void;
  selectConsole: (id: string | null) => void;
  selectNetwork: (id: string | null) => void;
  setConsoleFilter: (f: ConsoleFilter) => void;
  setCurrentRouteOnly: (on: boolean) => void;
  setHideIgnored: (on: boolean) => void;
  ignoreSimilar: (e: BrowserConsoleEvent) => void;
  clearIgnored: () => void;
}

/** Append to a capped list, dropping the oldest when over `max`. */
function capped<T>(list: T[], item: T, max: number): T[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The capture config to push to the guest, folding in the master `enabled` switch. */
export function selectGuestConfig(s: {
  enabled: boolean;
  config: BrowserDebugConfig;
}): BrowserDebugConfig {
  return {
    ...s.config,
    captureConsole: s.enabled && s.config.captureConsole,
    captureNetwork: s.enabled && s.config.captureNetwork,
  };
}

export const useBrowserDebugStore = create<BrowserDebugState>((set) => ({
  enabled: true,
  config: DEFAULT_DEBUG_CONFIG,
  redactSensitiveHeaders: true,
  maxEvents: DEFAULT_MAX_EVENTS,
  allowExternalCapture: false,
  console: [],
  network: [],
  ignored: [],
  selectedConsoleId: null,
  selectedNetworkId: null,
  consoleFilter: 'all',
  currentRouteOnly: false,
  hideIgnored: true,

  setEnabled: (enabled) => set({ enabled }),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setRedactSensitiveHeaders: (redactSensitiveHeaders) => set({ redactSensitiveHeaders }),
  setMaxEvents: (maxEvents) => set({ maxEvents: Math.max(10, Math.round(maxEvents)) }),
  setAllowExternalCapture: (allowExternalCapture) => set({ allowExternalCapture }),
  applySettings: (p) =>
    set((s) => ({
      enabled: typeof p.enabled === 'boolean' ? p.enabled : s.enabled,
      redactSensitiveHeaders:
        typeof p.redactSensitiveHeaders === 'boolean' ? p.redactSensitiveHeaders : s.redactSensitiveHeaders,
      maxEvents: typeof p.maxEvents === 'number' ? Math.max(10, Math.round(p.maxEvents)) : s.maxEvents,
      allowExternalCapture:
        typeof p.allowExternalCapture === 'boolean' ? p.allowExternalCapture : s.allowExternalCapture,
      config: {
        captureConsole: p.captureConsole ?? s.config.captureConsole,
        captureNetwork: p.captureNetwork ?? s.config.captureNetwork,
        captureRequestBodies: p.captureRequestBodies ?? s.config.captureRequestBodies,
        captureResponseBodies: p.captureResponseBodies ?? s.config.captureResponseBodies,
        maxBodyKb: typeof p.maxBodyKb === 'number' ? p.maxBodyKb : s.config.maxBodyKb,
      },
    })),
  addConsole: (e) => set((s) => ({ console: capped(s.console, e, s.maxEvents) })),
  addNetwork: (e) => set((s) => ({ network: capped(s.network, e, s.maxEvents) })),
  clearConsole: () => set({ console: [], selectedConsoleId: null }),
  clearNetwork: () => set({ network: [], selectedNetworkId: null }),
  clearAll: () => set({ console: [], network: [], selectedConsoleId: null, selectedNetworkId: null }),
  selectConsole: (id) => set({ selectedConsoleId: id }),
  selectNetwork: (id) => set({ selectedNetworkId: id }),
  setConsoleFilter: (consoleFilter) => set({ consoleFilter }),
  setCurrentRouteOnly: (currentRouteOnly) => set({ currentRouteOnly }),
  setHideIgnored: (hideIgnored) => set({ hideIgnored }),
  ignoreSimilar: (e) =>
    set((s) => {
      const sig = consoleSignature(e);
      return s.ignored.includes(sig) ? s : { ignored: [...s.ignored, sig] };
    }),
  clearIgnored: () => set({ ignored: [] }),
}));
