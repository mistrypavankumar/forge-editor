import { create } from 'zustand';
import type {
  AgentCheck,
  AgentPlan,
  AgentSession,
  AgentStatus,
  AgentToolName,
  CheckStatus,
  FilePatch,
  PatchState,
  TimelineEntry,
} from '../agent/types';

/**
 * Store for the AI Agent Workspace Mode. Holds the single current {@link AgentSession} plus a
 * feature flag. Actions are intentionally low-level (start/finish tool, set plan, set patch state)
 * so the orchestrator drives the flow and this store just records it. The session is persisted to
 * localStorage on a best-effort basis so an in-progress task survives a window reload.
 */

const STORAGE_KEY = 'forge.agent.session.v1';
const FLAG_KEY = 'forge.agent.enabled.v1';

let seq = 0;
const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

function loadSession(): AgentSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AgentSession;
    // A task interrupted mid-flight by a reload can't resume its in-flight request; settle it.
    if (s.status === 'planning' || s.status === 'editing' || s.status === 'checking') {
      s.status = s.plan ? 'review' : 'idle';
    }
    return s;
  } catch {
    return null;
  }
}

function loadFlag(): boolean {
  try {
    const raw = localStorage.getItem(FLAG_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function persist(session: AgentSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota exceeded or storage unavailable — persistence is best-effort, so ignore.
  }
}

interface AgentStoreState {
  /** Feature flag for the whole Agent mode (persisted). */
  enabled: boolean;
  session: AgentSession | null;
  setEnabled: (on: boolean) => void;
  /** Begin a fresh session for `task`, discarding any previous one. */
  newSession: (task: string, rootPath: string | null) => AgentSession;
  setStatus: (status: AgentStatus) => void;
  setError: (error: string | null) => void;
  setPlan: (plan: AgentPlan) => void;
  setPatches: (patches: FilePatch[]) => void;
  setPatchState: (path: string, state: PatchState) => void;
  addNote: (kind: 'note' | 'plan' | 'error' | 'check', text: string) => void;
  /** Record a tool call as running; returns its id for {@link finishTool}. */
  startTool: (tool: AgentToolName, detail: string) => string;
  finishTool: (id: string, status: 'ok' | 'error', error?: string) => void;
  /** Record a check as running; returns its id for {@link finishCheck}. */
  startCheck: (label: string, command: string) => string;
  finishCheck: (
    id: string,
    patch: { status: CheckStatus; exitCode: number | null; output: string; errors: string[]; durationMs: number },
  ) => void;
  clearChecks: () => void;
  reset: () => void;
}

/** Apply a partial update to the current session, stamp `updatedAt`, and persist. */
function updateSession(
  state: AgentStoreState,
  fn: (s: AgentSession) => AgentSession,
): Partial<AgentStoreState> {
  if (!state.session) return {};
  const next = fn(state.session);
  next.updatedAt = Date.now();
  persist(next);
  return { session: next };
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  enabled: loadFlag(),
  session: loadSession(),

  setEnabled: (on) => {
    try {
      localStorage.setItem(FLAG_KEY, String(on));
    } catch {
      /* ignore */
    }
    set({ enabled: on });
  },

  newSession: (task, rootPath) => {
    const now = Date.now();
    const session: AgentSession = {
      id: uid('sess'),
      task,
      status: 'idle',
      rootPath,
      plan: null,
      patches: [],
      checks: [],
      timeline: [],
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    persist(session);
    set({ session });
    return session;
  },

  setStatus: (status) => set((st) => updateSession(st, (s) => ({ ...s, status }))),
  setError: (error) =>
    set((st) => updateSession(st, (s) => ({ ...s, error, status: error ? 'error' : s.status }))),
  setPlan: (plan) => set((st) => updateSession(st, (s) => ({ ...s, plan }))),
  setPatches: (patches) => set((st) => updateSession(st, (s) => ({ ...s, patches }))),
  setPatchState: (path, state) =>
    set((st) =>
      updateSession(st, (s) => ({
        ...s,
        patches: s.patches.map((p) => (p.path === path ? { ...p, state } : p)),
      })),
    ),

  addNote: (kind, text) =>
    set((st) =>
      updateSession(st, (s) => ({
        ...s,
        timeline: [...s.timeline, { type: 'note', id: uid('note'), kind, text, at: Date.now() }],
      })),
    ),

  startTool: (tool, detail) => {
    const id = uid('tool');
    const entry: TimelineEntry = { type: 'tool', id, tool, detail, status: 'running', at: Date.now() };
    set((st) => updateSession(st, (s) => ({ ...s, timeline: [...s.timeline, entry] })));
    return id;
  },
  finishTool: (id, status, error) =>
    set((st) =>
      updateSession(st, (s) => ({
        ...s,
        timeline: s.timeline.map((e) =>
          e.type === 'tool' && e.id === id ? { ...e, status, error } : e,
        ),
      })),
    ),

  startCheck: (label, command) => {
    const id = uid('check');
    const check: AgentCheck = {
      id,
      label,
      command,
      status: 'running',
      exitCode: null,
      output: '',
      errors: [],
      durationMs: 0,
    };
    set((st) => updateSession(st, (s) => ({ ...s, checks: [...s.checks, check] })));
    return id;
  },
  finishCheck: (id, patch) =>
    set((st) =>
      updateSession(st, (s) => ({
        ...s,
        checks: s.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    ),
  clearChecks: () => set((st) => updateSession(st, (s) => ({ ...s, checks: [] }))),

  reset: () => {
    persist(null);
    set({ session: null });
  },
}));
