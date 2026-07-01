/**
 * A short, gentle two-note chime played when a wellness break begins. Synthesized with the Web
 * Audio API so there's no audio file to bundle (and nothing for the renderer's CSP to block).
 *
 * The sound is intentionally soft — a calm "time to rest" cue, not an alarm: two sine tones a
 * fifth apart, each with a quick attack and a long, smooth decay.
 */
export function playWellnessChime(): void {
  type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
  const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctx) return;

  try {
    const ctx = new Ctx();
    const start = ctx.currentTime;

    // C6 then G6 — a soft ascending fifth.
    const notes = [
      { freq: 1046.5, at: 0 },
      { freq: 1568.0, at: 0.18 },
    ];

    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const t0 = start + at;
      // Quick attack to a low peak, then a smooth exponential decay (kept gentle on the ears).
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    }

    // Free the audio context once the chime has finished sounding.
    window.setTimeout(() => void ctx.close().catch(() => {}), 1600);
  } catch {
    // Audio is a nice-to-have — never let a playback failure break the reminder.
  }
}
