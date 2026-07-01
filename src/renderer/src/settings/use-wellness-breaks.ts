import { useEffect, useRef } from 'react';
import { useWellnessStore } from '../stores/wellness-store';

/** Don't interrupt a break while the user typed/clicked within this window (ms). */
const FLOW_GUARD_MS = 6000;

/**
 * Drives the wellness-break scheduler. When enabled, it fires a break every `intervalMin`
 * minutes — but never mid-flow: if the user typed or clicked in the last few seconds, or the
 * window is hidden, the due break is held back and retried on the next tick. The break itself
 * (overlay + countdown) is rendered by WellnessBreakOverlay; this hook only decides *when*.
 */
export function useWellnessBreaks(): void {
  const enabled = useWellnessStore((s) => s.enabled);
  const intervalMin = useWellnessStore((s) => s.intervalMin);
  const active = useWellnessStore((s) => s.active);

  const nextDueRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());

  // Track recent user activity so we can defer a break that would land mid-keystroke.
  useEffect(() => {
    const mark = (): void => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('keydown', mark, true);
    window.addEventListener('mousedown', mark, true);
    return () => {
      window.removeEventListener('keydown', mark, true);
      window.removeEventListener('mousedown', mark, true);
    };
  }, []);

  // (Re)arm the next break whenever the feature is toggled, the interval changes, or a break ends.
  useEffect(() => {
    if (!enabled || active) return;
    nextDueRef.current = Date.now() + intervalMin * 60_000;
  }, [enabled, intervalMin, active]);

  // The tick: once per second, fire the break if it's due and the moment is right.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const store = useWellnessStore.getState();
      if (store.active) return; // a break is already showing
      if (Date.now() < nextDueRef.current) return; // not due yet
      if (document.hidden) return; // app not in front — wait until it is
      if (Date.now() - lastActivityRef.current < FLOW_GUARD_MS) return; // mid-flow — hold back
      store.startBreak();
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled]);
}
