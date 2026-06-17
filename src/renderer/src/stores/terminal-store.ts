import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  title: string;
}

export interface TerminalGroup {
  id: string;
  sessions: string[]; // session ids shown side-by-side when this group is active
}

let sSeq = 0;
let gSeq = 0;
function makeSession(): TerminalSession {
  sSeq += 1;
  return { id: `term-${sSeq}`, title: `zsh ${sSeq}` };
}
function makeGroupId(): string {
  gSeq += 1;
  return `grp-${gSeq}`;
}

const s0 = makeSession();
const g0: TerminalGroup = { id: makeGroupId(), sessions: [s0.id] };

export interface TerminalState {
  sessions: Record<string, TerminalSession>;
  groups: TerminalGroup[];
  activeGroupId: string;
  activeSessionId: string;
  newTerminal: () => void;
  splitActive: () => void;
  closeSession: (id: string) => void;
  focusGroup: (groupId: string) => void;
  focusSession: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: { [s0.id]: s0 },
  groups: [g0],
  activeGroupId: g0.id,
  activeSessionId: s0.id,

  newTerminal: () => {
    const s = makeSession();
    const g: TerminalGroup = { id: makeGroupId(), sessions: [s.id] };
    set((st) => ({
      sessions: { ...st.sessions, [s.id]: s },
      groups: [...st.groups, g],
      activeGroupId: g.id,
      activeSessionId: s.id,
    }));
  },

  splitActive: () => {
    const st = get();
    const s = makeSession();
    set({
      sessions: { ...st.sessions, [s.id]: s },
      groups: st.groups.map((g) =>
        g.id === st.activeGroupId ? { ...g, sessions: [...g.sessions, s.id] } : g,
      ),
      activeSessionId: s.id,
    });
  },

  closeSession: (id) =>
    set((st) => {
      const sessions = { ...st.sessions };
      delete sessions[id];
      const groups = st.groups
        .map((g) => ({ ...g, sessions: g.sessions.filter((x) => x !== id) }))
        .filter((g) => g.sessions.length > 0);

      if (groups.length === 0) {
        const s = makeSession();
        const g: TerminalGroup = { id: makeGroupId(), sessions: [s.id] };
        return { sessions: { [s.id]: s }, groups: [g], activeGroupId: g.id, activeSessionId: s.id };
      }

      let activeGroupId = st.activeGroupId;
      let activeSessionId = st.activeSessionId;
      let activeGroup = groups.find((g) => g.id === activeGroupId);
      if (!activeGroup) {
        activeGroup = groups[groups.length - 1];
        activeGroupId = activeGroup.id;
      }
      if (!activeGroup.sessions.includes(activeSessionId)) {
        activeSessionId = activeGroup.sessions[activeGroup.sessions.length - 1];
      }
      return { sessions, groups, activeGroupId, activeSessionId };
    }),

  focusGroup: (groupId) =>
    set((st) => {
      const g = st.groups.find((x) => x.id === groupId);
      if (!g) return st;
      return { activeGroupId: groupId, activeSessionId: g.sessions[0] };
    }),

  focusSession: (id) =>
    set((st) => {
      const g = st.groups.find((x) => x.sessions.includes(id));
      if (!g) return st;
      return { activeGroupId: g.id, activeSessionId: id };
    }),
}));
