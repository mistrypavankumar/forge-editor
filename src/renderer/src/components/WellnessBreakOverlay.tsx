import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWellnessStore } from '../stores/wellness-store';
import { exerciseById } from '../lib/wellness-exercises';
import { playWellnessChime } from '../lib/wellness-chime';

function formatClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function WellnessBreakOverlay(): React.JSX.Element | null {
  const active = useWellnessStore((s) => s.active);
  const strict = useWellnessStore((s) => s.strict);
  const breakSec = useWellnessStore((s) => s.breakSec);
  const exerciseId = useWellnessStore((s) => s.currentExerciseId);

  const [remaining, setRemaining] = useState(breakSec);

  // Reset and count down whenever a break begins.
  useEffect(() => {
    if (!active) return;
    if (useWellnessStore.getState().sound) playWellnessChime();
    setRemaining(breakSec);
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          useWellnessStore.getState().endBreak();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, breakSec]);

  if (!active) return null;

  const exercise = exerciseId ? exerciseById(exerciseId) : undefined;
  const done = remaining <= 0;
  const Icon = exercise?.icon;
  const elapsedFrac = breakSec > 0 ? (breakSec - remaining) / breakSec : 1;
  const ring = `conic-gradient(var(--color-accent, #6aa3ff) ${elapsedFrac * 360}deg, var(--color-surface-3, #2a2a2a) 0deg)`;

  return createPortal(
    <div className="fixed inset-0 z-[4000] flex flex-col items-center justify-center bg-bg/95 backdrop-blur-md">
      <div className="flex max-w-lg flex-col items-center px-8 text-center">
        <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-faint">
          {exercise?.group === 'Eyes' ? 'Eye break' : 'Wellness break'}
        </div>

        {Icon ? (
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent">
            <Icon size={30} strokeWidth={1.75} />
          </div>
        ) : null}

        <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-fg">
          {exercise?.title ?? 'Take a break'}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {exercise?.instruction ?? 'Step away from the screen for a moment and stretch.'}
        </p>

        {/* Countdown ring */}
        <div className="mt-9 grid h-28 w-28 place-items-center rounded-full" style={{ background: ring }}>
          <div className="grid h-[104px] w-[104px] place-items-center rounded-full bg-bg">
            <span className="font-mono text-[22px] tabular-nums text-fg">{formatClock(remaining)}</span>
          </div>
        </div>

        <div className="mt-9 flex flex-col items-center gap-3">
          {done ? (
            <button
              type="button"
              onClick={() => useWellnessStore.getState().endBreak()}
              className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Back to work
            </button>
          ) : strict ? (
            <>
              <div className="text-[12.5px] text-faint">Take the full break — it&apos;s good for you.</div>
              <button
                type="button"
                onClick={() => useWellnessStore.getState().endBreak()}
                className="rounded-lg border border-line px-4 py-1.5 text-[12px] text-faint transition-colors hover:border-danger/60 hover:text-danger"
              >
                Emergency skip
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => useWellnessStore.getState().endBreak()}
              className="rounded-xl border border-line bg-surface px-6 py-2.5 text-[14px] text-fg transition-colors hover:border-line-strong"
            >
              Skip break
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
