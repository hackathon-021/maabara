import type { DashboardDTO } from '@/lib/contracts';

// Conventions #0: types only. This module is in the browser bundle — never import
// @/lib/dashboard or @/lib/timeline here, they carry Prisma with them.

/** A whole percent, clamped, and zero rather than NaN when there is nothing to divide by. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export interface KpiTile {
  key: string;
  label: string;
  value: number;
  tone: 'neutral' | 'ok' | 'warn' | 'danger';
  /** Second channel for the status tones — see the comment below. */
  glyph: string | null;
}

/**
 * The six buckets, in chain order.
 *
 * The two loss tiles each carry their own glyph as well as their own tone. The
 * palette validator measures warn (#B26A00) against ok (#1B7F3B) at ΔE 3.1 under
 * protanopia and against danger (#C62828) at ΔE 13.3 with normal colour vision —
 * so a commander scanning for losses cannot be asked to tell them apart by colour.
 * The palette is P3's and stays as it is; the glyph is the fix.
 */
export function kpiTiles(k: DashboardDTO['kpis']): KpiTile[] {
  return [
    { key: 'packed', label: 'ארוז וממתין', value: k.packed, tone: 'neutral', glyph: null },
    { key: 'inTransit', label: 'בדרך', value: k.inTransit, tone: 'neutral', glyph: null },
    { key: 'received', label: 'התקבל ביעד', value: k.received, tone: 'neutral', glyph: null },
    { key: 'distributed', label: 'פוזר', value: k.distributed, tone: 'ok', glyph: '✔' },
    { key: 'missing', label: 'חסר', value: k.missing, tone: 'danger', glyph: '✕' },
    { key: 'short', label: 'בחוסר', value: k.short, tone: 'warn', glyph: '!' },
  ];
}

/** Everything that has entered the chain — the numerator of the headline figure. */
export function handledTotal(k: DashboardDTO['kpis']): number {
  return k.packed + k.inTransit + k.received + k.distributed + k.missing + k.short;
}

/** How old the numbers on screen are. Never negative, however the viewer's clock is set. */
export function freshnessLabel(generatedAt: string, now: number): string {
  const age = Math.max(0, Math.round((now - new Date(generatedAt).getTime()) / 1000));
  if (age < 10) return 'עודכן עכשיו';
  if (age < 60) return `עודכן לפני ${age} שניות`;
  return `עודכן לפני ${Math.round(age / 60)} דקות`;
}

/**
 * Rooms under their section heading. The server already returns them grouped and
 * sorted; this keeps a group together even if that ever changes, and preserves
 * arrival order so the grid does not reshuffle under the poll.
 */
export function roomsByGroup(
  rooms: DashboardDTO['rooms'],
): { groupName: string; rooms: DashboardDTO['rooms'] }[] {
  const groups: { groupName: string; rooms: DashboardDTO['rooms'] }[] = [];
  for (const room of rooms) {
    const existing = groups.find((g) => g.groupName === room.groupName);
    if (existing) existing.rooms.push(room);
    else groups.push({ groupName: room.groupName, rooms: [room] });
  }
  return groups;
}

/**
 * How a loss is marked. Glyph first, then a Hebrew label, then a tone — in that
 * order of importance, because the two tones are close enough to be confused even
 * by a reader with full colour vision (ΔE 13.3) and identical under protanopia.
 */
export function exceptionBadge(kind: 'missing_box' | 'short_item'): {
  glyph: string;
  label: string;
  tone: 'danger' | 'warn';
} {
  return kind === 'missing_box'
    ? { glyph: '✕', label: 'אריזה חסרה', tone: 'danger' }
    : { glyph: '!', label: 'פריט בחוסר', tone: 'warn' };
}

/**
 * A typed box code, or null. Deliberately stricter than the field scanner's
 * normalizer: a commander types this by hand from a printed label, so a five-digit
 * string is the only thing worth sending to the server.
 */
export function parseSearchCode(raw: string): string | null {
  const trimmed = raw.trim();
  return /^\d{5}$/.test(trimmed) ? trimmed : null;
}
