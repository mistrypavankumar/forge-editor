import { create } from 'zustand';
import { ALL_EXERCISE_IDS } from '../lib/wellness-exercises';

export const WELLNESS_INTERVAL_MIN = 5;
export const WELLNESS_INTERVAL_MAX = 180;
export const WELLNESS_BREAK_MIN = 15;
export const WELLNESS_BREAK_MAX = 300;

export interface WellnessState {
  /** Master switch for the stretch / eye-rest break reminders. Off by default (opt-in). */
  enabled: boolean;
  /** Minutes of work between breaks. */
  intervalMin: number;
  /** How long each break lasts, in seconds. */
  breakSec: number;
  /**
   * Strict mode: the break overlay can't be skipped normally — you wait out the timer.
   * The only early exit is the "Emergency skip" button, for when you're mid-incident.
   */
  strict: boolean;
  /** Ids of the exercises currently in the rotation (see WELLNESS_EXERCISES). */
  exercises: string[];
  /** Play a gentle chime when a break begins. On by default. */
  sound: boolean;

  // --- runtime (not persisted) ---
  /** True while the full-screen break overlay is showing. */
  active: boolean;
  /** The exercise id chosen for the break that's currently active. */
  currentExerciseId: string | null;
  /** Monotonic counter so consecutive breaks cycle through the rotation deterministically. */
  rotation: number;

  setEnabled: (v: boolean) => void;
  setIntervalMin: (v: number) => void;
  setBreakSec: (v: number) => void;
  setStrict: (v: boolean) => void;
  setSound: (v: boolean) => void;
  toggleExercise: (id: string) => void;
  /** Begin a break now, picking the next exercise in the rotation. */
  startBreak: () => void;
  /** End the current break (timer elapsed, skipped, or emergency-skipped). */
  endBreak: () => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export const useWellnessStore = create<WellnessState>((set, get) => ({
  enabled: false,
  intervalMin: 30,
  breakSec: 40,
  strict: false,
  exercises: [...ALL_EXERCISE_IDS],
  sound: true,

  active: false,
  currentExerciseId: null,
  rotation: 0,

  setEnabled: (v) => set({ enabled: v }),
  setIntervalMin: (v) => set({ intervalMin: clamp(Math.round(v), WELLNESS_INTERVAL_MIN, WELLNESS_INTERVAL_MAX) }),
  setBreakSec: (v) => set({ breakSec: clamp(Math.round(v), WELLNESS_BREAK_MIN, WELLNESS_BREAK_MAX) }),
  setStrict: (v) => set({ strict: v }),
  setSound: (v) => set({ sound: v }),
  toggleExercise: (id) =>
    set((s) => {
      const on = s.exercises.includes(id);
      // Never let the rotation become empty — keep at least one exercise selected.
      if (on && s.exercises.length === 1) return s;
      return { exercises: on ? s.exercises.filter((x) => x !== id) : [...s.exercises, id] };
    }),
  startBreak: () => {
    const { exercises, rotation } = get();
    const pool = exercises.length > 0 ? exercises : [...ALL_EXERCISE_IDS];
    const id = pool[rotation % pool.length];
    set({ active: true, currentExerciseId: id, rotation: rotation + 1 });
  },
  endBreak: () => set({ active: false, currentExerciseId: null }),
}));
