import { create } from 'zustand';
import type { JdtlsStatus } from '@shared/ipc-contract';

interface JavaStatusState {
  status: JdtlsStatus;
  setStatus: (status: JdtlsStatus) => void;
}

/** Mirrors the main-process jdtls lifecycle, pushed over IPC (see AppShell subscription). */
export const useJavaStatusStore = create<JavaStatusState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));
