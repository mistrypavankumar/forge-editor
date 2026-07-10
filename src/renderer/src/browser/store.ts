import { create } from 'zustand';
import type { BrowserInspectorSelection, DevServerStatus } from '@shared/ipc-contract';
import type { ComponentMatch } from './resolver';

/** Candidate dev-server ports probed on panel open (Next.js, Vite, CRA, common alternates). */
export const DEFAULT_DEV_PORTS = [3000, 3001, 5173, 5174, 8080];

export interface BrowserState {
  /** Address-bar value; the URL the user asked to load. */
  url: string;
  /** URL currently shown by the webview (updated on navigation). */
  currentUrl: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  inspectMode: boolean;
  /** Last clicked element (drives the inspector details panel). */
  selection: BrowserInspectorSelection | null;
  /** Live hover info (drives nothing persistent; kept for the details panel when not clicked). */
  hover: BrowserInspectorSelection | null;
  /** Component picker candidates when a click matched more than one source file. */
  matches: ComponentMatch[];
  /** Human-readable status/among the inspector (e.g. "No matching source found"). */
  message: string | null;
  devServers: DevServerStatus[];

  setUrl: (url: string) => void;
  setNav: (nav: Partial<Pick<BrowserState, 'currentUrl' | 'loading' | 'canGoBack' | 'canGoForward'>>) => void;
  setInspectMode: (on: boolean) => void;
  toggleInspectMode: () => void;
  setSelection: (s: BrowserInspectorSelection | null) => void;
  setHover: (s: BrowserInspectorSelection | null) => void;
  setMatches: (m: ComponentMatch[]) => void;
  setMessage: (m: string | null) => void;
  setDevServers: (d: DevServerStatus[]) => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  url: 'http://localhost:3000',
  currentUrl: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  inspectMode: false,
  selection: null,
  hover: null,
  matches: [],
  message: null,
  devServers: [],

  setUrl: (url) => set({ url }),
  setNav: (nav) => set(nav),
  setInspectMode: (on) => set({ inspectMode: on }),
  toggleInspectMode: () => set((s) => ({ inspectMode: !s.inspectMode })),
  setSelection: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  setMatches: (matches) => set({ matches }),
  setMessage: (message) => set({ message }),
  setDevServers: (devServers) => set({ devServers }),
}));

/**
 * Imperative handle to the mounted BrowserView, so command-palette commands (which run outside
 * React) can drive the webview. Mirrors the terminal-exec registry pattern.
 */
export interface BrowserController {
  reload: () => void;
  back: () => void;
  forward: () => void;
  loadUrl: (url: string) => void;
  /** Re-open the source for the current selection (Open Selected Element Source command). */
  openSelectedSource: () => void;
}

let controller: BrowserController | null = null;

export function registerBrowserController(c: BrowserController | null): void {
  controller = c;
}

export function getBrowserController(): BrowserController | null {
  return controller;
}
