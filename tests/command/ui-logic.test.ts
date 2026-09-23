import { describe, expect, it } from 'vitest';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from '@/components/command/format';
import { exceptionBadge, freshnessLabel, handledTotal, kpiTiles, progressPercent, roomsByGroup } from '@/components/command/logic';

const kpis = (over: Partial<DashboardDTO['kpis']> = {}): DashboardDTO['kpis'] => ({
  totalMapped: 40,
  packed: 2,
  inTransit: 4,
  received: 3,
  distributed: 8,
  missing: 7,
  short: 3,
  ...over,
});

describe('kpiTiles', () => {
  it('lays the six buckets out in chain order', () => {
    expect(kpiTiles(kpis()).map((t) => t.key)).toEqual([
      'packed',
      'inTransit',
      'received',
      'distributed',
      'missing',
      'short',
    ]);
  });

  it('reads each value off the KPIs', () => {
    const byKey = Object.fromEntries(kpiTiles(kpis()).map((t) => [t.key, t.value]));
    expect(byKey).toEqual({ packed: 2, inTransit: 4, received: 3, distributed: 8, missing: 7, short: 3 });
  });

  /**
   * Review Focus 1. Measured, not guessed: warn #B26A00 and ok #1B7F3B are ΔE 3.1
   * apart under protanopia, and danger #C62828 and warn are ΔE 13.3 apart with full
   * colour vision. The two loss tiles are what a commander scans for, so they must
   * differ by more than their tone.
   */
  it('gives every loss state its own glyph, not just its own colour', () => {
    const tiles = kpiTiles(kpis());
    const missing = tiles.find((t) => t.key === 'missing');
    const short = tiles.find((t) => t.key === 'short');
    expect(missing?.tone).toBe('danger');
    expect(short?.tone).toBe('warn');
    expect(missing?.glyph).toBeTruthy();
    expect(short?.glyph).toBeTruthy();
    expect(missing?.glyph).not.toBe(short?.glyph);
  });

  it('labels every tile in Hebrew, with no trailing colon', () => {
    for (const tile of kpiTiles(kpis())) {
      expect(tile.label.length).toBeGreaterThan(0);
      expect(tile.label.endsWith(':')).toBe(false);
    }
  });

  it('uses distinct labels so no two tiles read the same', () => {
    const labels = kpiTiles(kpis()).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('progressPercent', () => {
  it('rounds to a whole percent', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });

  // Review Focus 2: an unmapped room, and an empty database.
  it('is zero rather than NaN when nothing is mapped', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });

  it('never exceeds a hundred', () => {
    expect(progressPercent(12, 10)).toBe(100);
  });
});

describe('handledTotal', () => {
  it('adds up everything that has entered the chain', () => {
    expect(handledTotal(kpis())).toBe(27);
  });

  // Review Focus 2.
  it('is zero before anything has been packed', () => {
    expect(
      handledTotal(kpis({ packed: 0, inTransit: 0, received: 0, distributed: 0, missing: 0, short: 0 })),
    ).toBe(0);
  });
});

describe('freshnessLabel', () => {
  const at = (secondsAgo: number) => {
    const now = Date.UTC(2026, 8, 22, 14, 0, 0);
    return freshnessLabel(new Date(now - secondsAgo * 1000).toISOString(), now);
  };

  it('says "now" for a fresh poll', () => {
    expect(at(0)).toBe('עודכן עכשיו');
    expect(at(4)).toBe('עודכן עכשיו');
  });

  it('counts seconds, then minutes', () => {
    expect(at(30)).toBe('עודכן לפני 30 שניות');
    expect(at(120)).toBe('עודכן לפני 2 דקות');
  });

  // Review Focus 5: a laptop clock ahead of the server's must not read "in -3 seconds".
  it('never reports a time in the future', () => {
    const now = Date.UTC(2026, 8, 22, 14, 0, 0);
    expect(freshnessLabel(new Date(now + 5000).toISOString(), now)).toBe('עודכן עכשיו');
  });
});

describe('formatHeDateTime', () => {
  it('shows a day, a month and a time', () => {
    const iso = new Date(2026, 8, 22, 14, 5).toISOString();
    expect(formatHeDateTime(iso)).toBe('22/09 14:05');
  });

  it('pads single digits', () => {
    expect(formatHeDateTime(new Date(2026, 0, 3, 9, 7).toISOString())).toBe('03/01 09:07');
  });

  it('shows a dash when there is no timestamp', () => {
    expect(formatHeDateTime(null)).toBe('—');
  });
});

const room = (id: number, groupName: string, description: string, over: Partial<DashboardDTO['rooms'][number]> = {}) => ({
  id,
  groupName,
  description,
  status: 'done' as const,
  mappedQty: 10,
  packedQty: 0,
  ...over,
});

describe('roomsByGroup', () => {
  it('groups rooms under their section, keeping the order they arrived in', () => {
    const grouped = roomsByGroup([
      room(1, 'ענף תקשוב', 'חדר 101'),
      room(2, 'ענף תקשוב', 'חדר 102'),
      room(3, 'ענף לוגיסטיקה', 'חדר 201'),
    ]);
    expect(grouped.map((g) => g.groupName)).toEqual(['ענף תקשוב', 'ענף לוגיסטיקה']);
    expect(grouped[0].rooms.map((r) => r.description)).toEqual(['חדר 101', 'חדר 102']);
    expect(grouped[1].rooms).toHaveLength(1);
  });

  it('keeps a group together even when its rooms are not adjacent', () => {
    const grouped = roomsByGroup([
      room(1, 'ענף תקשוב', 'חדר 101'),
      room(3, 'ענף לוגיסטיקה', 'חדר 201'),
      room(2, 'ענף תקשוב', 'חדר 102'),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].rooms).toHaveLength(2);
  });

  // Review Focus 2.
  it('returns nothing for an operation with no rooms', () => {
    expect(roomsByGroup([])).toEqual([]);
  });
});

describe('exceptionBadge', () => {
  it('names a missing box in Hebrew', () => {
    expect(exceptionBadge('missing_box')).toEqual({ glyph: '✕', label: 'אריזה חסרה', tone: 'danger' });
  });

  it('names a short item in Hebrew', () => {
    expect(exceptionBadge('short_item')).toEqual({ glyph: '!', label: 'פריט בחוסר', tone: 'warn' });
  });

  /**
   * Review Focus 1: danger #C62828 and warn #B26A00 measure ΔE 13.3 apart with full
   * colour vision — below the threshold at which a reader can tell them apart. The
   * two kinds of loss must never be distinguished by tone alone.
   */
  it('separates the two kinds of loss by glyph and by label, not only by tone', () => {
    const missing = exceptionBadge('missing_box');
    const short = exceptionBadge('short_item');
    expect(missing.glyph).not.toBe(short.glyph);
    expect(missing.label).not.toBe(short.label);
    expect(missing.tone).not.toBe(short.tone);
  });
});
