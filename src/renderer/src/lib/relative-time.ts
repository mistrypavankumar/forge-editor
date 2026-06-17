const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

const STEPS: [seconds: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [604800, 'day'],
  [2592000, 'week'],
  [31536000, 'month'],
  [Infinity, 'year'],
];

const DIVISOR: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000,
};

/** Human "9 months ago" style string from an epoch-seconds timestamp. */
export function relativeTime(epochSeconds: number): string {
  const diff = Math.max(1, Math.floor(Date.now() / 1000 - epochSeconds));
  const [, unit] = STEPS.find(([limit]) => diff < limit) ?? STEPS[STEPS.length - 1];
  return rtf.format(-Math.floor(diff / DIVISOR[unit]), unit);
}
