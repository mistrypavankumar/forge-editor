import { create } from 'zustand';
import type { AwsProfile, AwsValidation } from '@shared/ipc-contract';

/** Per-profile validation state: 'pending' while probing, then the CLI result. */
export type AwsStatus = 'pending' | AwsValidation;

export interface AwsState {
  /** Active profile name, or null for "No connection". */
  active: string | null;
  region: string | null;
  profiles: AwsProfile[];
  statuses: Record<string, AwsStatus>;
  pickerOpen: boolean;
  /** Whether the side-by-side config/credentials editor is open. */
  editOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  openEdit: () => void;
  closeEdit: () => void;
  /** Load the active connection + profile list (called on mount and when opening the picker). */
  load: () => Promise<void>;
  /** Probe every profile's credentials in parallel and fill `statuses`. */
  validateAll: () => Promise<void>;
  /** Make a profile active (persists in main); pass null to disconnect. */
  setActive: (name: string | null, region?: string | null) => Promise<void>;
}

export const useAwsStore = create<AwsState>((set, get) => ({
  active: null,
  region: null,
  profiles: [],
  statuses: {},
  pickerOpen: false,
  editOpen: false,
  openPicker: () => {
    set({ pickerOpen: true });
    void get().load().then(() => get().validateAll());
  },
  closePicker: () => set({ pickerOpen: false }),
  openEdit: () => set({ editOpen: true, pickerOpen: false }),
  closeEdit: () => set({ editOpen: false }),

  load: async () => {
    const [activeRes, profilesRes] = await Promise.all([
      window.forge.awsGetActiveProfile(),
      window.forge.awsListProfiles(),
    ]);
    if (activeRes.ok) set({ active: activeRes.data.profile, region: activeRes.data.region });
    if (profilesRes.ok) set({ profiles: profilesRes.data });
  },

  validateAll: async () => {
    const { profiles } = get();
    set({ statuses: Object.fromEntries(profiles.map((p) => [p.name, 'pending' as AwsStatus])) });
    await Promise.all(
      profiles.map(async (p) => {
        const res = await window.forge.awsValidateProfile(p.name);
        const status: AwsStatus = res.ok ? res.data : { valid: false, error: 'Check failed' };
        set((s) => ({ statuses: { ...s.statuses, [p.name]: status } }));
      }),
    );
  },

  setActive: async (name, region) => {
    const res = await window.forge.awsSetActiveProfile(name, region ?? null);
    if (res.ok) set({ active: name, region: region ?? null });
  },
}));
