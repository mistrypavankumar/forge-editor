import { create } from 'zustand';
import type { BrowserInspectorSelection, DevServerStatus } from '@shared/ipc-contract';
import type { ComponentMatch, RouteMatch, SourceLocation } from './resolver';

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
  /** The source file resolved for the current selection (drives the Open Source / Copy actions). */
  resolved: (SourceLocation & { rel?: string }) | null;
  /** The Next.js route file for the current URL (drives Open Route File), independent of the click. */
  routeFile: RouteMatch | null;
  /** Files that use the selected component (drives Show Component Usage). */
  usages: { rel: string; path: string }[];
  /** Human-readable status/among the inspector (e.g. "No matching source found"). */
  message: string | null;
  /** A webview load failure (e.g. dev server not up yet). */
  loadError: string | null;
  devServers: DevServerStatus[];

  setUrl: (url: string) => void;
  setNav: (nav: Partial<Pick<BrowserState, 'currentUrl' | 'loading' | 'canGoBack' | 'canGoForward'>>) => void;
  setInspectMode: (on: boolean) => void;
  toggleInspectMode: () => void;
  setSelection: (s: BrowserInspectorSelection | null) => void;
  setHover: (s: BrowserInspectorSelection | null) => void;
  setMatches: (m: ComponentMatch[]) => void;
  setResolved: (r: (SourceLocation & { rel?: string }) | null) => void;
  setRouteFile: (r: RouteMatch | null) => void;
  setUsages: (u: { rel: string; path: string }[]) => void;
  setMessage: (m: string | null) => void;
  setLoadError: (m: string | null) => void;
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
  resolved: null,
  routeFile: null,
  usages: [],
  message: null,
  loadError: null,
  devServers: [],

  setUrl: (url) => set({ url }),
  setNav: (nav) => set(nav),
  setInspectMode: (on) => set({ inspectMode: on }),
  toggleInspectMode: () => set((s) => ({ inspectMode: !s.inspectMode })),
  setSelection: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  setMatches: (matches) => set({ matches }),
  setResolved: (resolved) => set({ resolved }),
  setRouteFile: (routeFile) => set({ routeFile }),
  setUsages: (usages) => set({ usages }),
  setMessage: (message) => set({ message }),
  setLoadError: (loadError) => set({ loadError }),
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
