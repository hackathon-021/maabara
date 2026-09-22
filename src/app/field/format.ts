/**
 * Shared display formatting for the field flows.
 * Owner: P4 (additive file in a folder whose pages belong to P3 — announce it in chat).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "22/09 14:05" in the phone's own timezone, or "—" when there is no timestamp yet. */
export function formatHeDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
