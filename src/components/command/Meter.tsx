import { progressPercent } from './logic';

/**
 * A single ratio against a limit. The fill is the brand hue and the track is a
 * lighter step of the same ramp (primary on primary-soft), so the state reads
 * across the whole bar rather than only where it stops.
 *
 * The page is dir="rtl", so the fill grows from the right on its own — do not add
 * a direction override here, it will silently render the bar backwards.
 */
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = progressPercent(value, max);
  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'התקדמות'}
      className="h-2 w-full overflow-hidden rounded-full bg-primary-soft"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
