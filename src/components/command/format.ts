/**
 * Display formatting for the command screens.
 * // TODO: P4 keeps an identical twin at src/app/field/format.ts. They were written
 * in parallel by different people; fold them into one shared module if there is time.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "22/09 14:05" in the viewer's own timezone, or "—" when there is no timestamp. */
export function formatHeDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
