import { create } from 'zustand';
import type { GitUser } from '@shared/ipc-contract';

/** Two identities are the same person if their emails match (case-insensitive). */
function sameUser(a: GitUser, b: GitUser): boolean {
  return a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
}

/** Add `user` to the list (replacing any entry with the same email), keeping order stable. */
function upsert(users: GitUser[], user: GitUser): GitUser[] {
  const rest = users.filter((u) => !sameUser(u, user));
  return [...rest, user];
}

export interface GitUserState {
  /** Saved identities offered in the picker (persisted via settings). */
  users: GitUser[];
  /** The identity configured in the current repo, or null when none/no repo open. */
  active: GitUser | null;
  pickerOpen: boolean;
  /** Last failure (e.g. setting config in a non-repo), shown in the picker. */
  error: string | null;
  openPicker: () => void;
  closePicker: () => void;
  /** Replace the saved list (used to hydrate from persisted settings). */
  setUsers: (users: GitUser[]) => void;
  /** Read the current repo's identity into `active`, remembering it in the saved list. */
  loadActive: (rootPath: string) => Promise<void>;
  /** Write `user` as the repo's identity and make it active; also saves it for next time. */
  setActive: (rootPath: string, user: GitUser) => Promise<void>;
  /** Forget a saved identity (does not touch the repo config). */
  removeUser: (email: string) => void;
}

export const useGitUserStore = create<GitUserState>((set, get) => ({
  users: [],
  active: null,
  pickerOpen: false,
  error: null,
  openPicker: () => set({ pickerOpen: true, error: null }),
  closePicker: () => set({ pickerOpen: false }),

  setUsers: (users) => set({ users }),

  loadActive: async (rootPath) => {
    const res = await window.forge.gitGetUser(rootPath);
    if (!res.ok) {
      set({ active: null });
      return;
    }
    const user = res.data;
    const active = user.name || user.email ? user : null;
    // Remember the repo's existing identity so it shows up as a quick-switch option.
    set((s) => ({ active, users: active ? upsert(s.users, active) : s.users }));
  },

  setActive: async (rootPath, user) => {
    const res = await window.forge.gitSetUser(rootPath, user.name, user.email);
    if (res.ok) {
      set((s) => ({ active: user, users: upsert(s.users, user), error: null }));
    } else {
      set({ error: res.error.split('\n')[0] });
    }
  },

  removeUser: (email) =>
    set((s) => ({ users: s.users.filter((u) => u.email.trim().toLowerCase() !== email.trim().toLowerCase()) })),
}));
