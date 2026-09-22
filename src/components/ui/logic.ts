/** Pure helpers shared by the kit. Kept out of the .tsx files so they can be tested in node. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const whole = Math.trunc(value);
  if (max < min) return min;
  return Math.min(Math.max(whole, min), max);
}

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

// One colour language for every status in the system, so a red chip always means loss.
const TONES: Record<string, Tone> = {
  missing: 'danger',
  short: 'danger',
  distributed_short: 'warn',
  received: 'ok',
  distributed: 'ok',
  released: 'ok',
  closed: 'ok',
  in_transit: 'info',
  loading: 'info',
  packing: 'info',
};

export function statusTone(status: string): Tone {
  return TONES[status] ?? 'neutral';
}
