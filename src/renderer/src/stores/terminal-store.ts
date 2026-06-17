import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  title: string;
}

let seq = 0;
function makeSession(): TerminalSession {
  seq += 1;
  return { id: `term-${seq}`, title: `zsh ${seq}` };
}

const first = makeSession();

export interface TerminalState {
  sessions: TerminalSession[];
  activeId: string;
  splitId: string | null;
  createSession: () => string;
  closeSession: (id: string) => void;
  setActive: (id: string) => void;
  toggleSplit: () => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [first],
  activeId: first.id,
  splitId: null,
  createSession: () => {
    const s = makeSession();
    set((st) => ({ sessions: [...st.sessions, s], activeId: s.id }));
    return s.id;
  },
  closeSession: (id) =>
    set((st) => {
      const sessions = st.sessions.filter((x) => x.id !== id);
      if (sessions.length === 0) {
        const s = makeSession();
        return { sessions: [s], activeId: s.id, splitId: null };
      }
      const splitId = st.splitId === id ? null : st.splitId;
      const activeId = st.activeId === id ? sessions[sessions.length - 1].id : st.activeId;
      return { sessions, activeId, splitId };
    }),
  setActive: (id) => set({ activeId: id }),
  toggleSplit: () => {
    const st = get();
    if (st.splitId) {
      set({ splitId: null });
      return;
    }
    let second = st.sessions.find((s) => s.id !== st.activeId);
    if (!second) {
      second = makeSession();
      set((state) => ({ sessions: [...state.sessions, second as TerminalSession] }));
    }
    set({ splitId: second.id });
  },
}));
