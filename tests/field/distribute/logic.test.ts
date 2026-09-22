import { describe, expect, it } from 'vitest';
import type { PackingUnitDTO, PackingUnitItemDTO, PackingUnitStatus } from '@/lib/contracts';
import {
  destinationLine,
  distributeRequest,
  distributeSummary,
  distributeVerdict,
  emptyDraft,
  fullDraft,
  maxFor,
  needsItemStep,
  roomWarning,
  shortfall,
} from '@/app/field/distribute/logic';

const item = (id: number, name: string, quantity: number): PackingUnitItemDTO => ({
  id,
  mappingReportId: id * 10,
  name,
  serial: null,
  quantity,
  distributedQuantity: 0,
  itemStatus: 'received',
});

const unit = (over: Partial<PackingUnitDTO> = {}): PackingUnitDTO => ({
  id: 1,
  code: '10001',
  type: 'professional_carton',
  status: 'received',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: 'רס"ל דנה כהן',
  transportUnitId: 1,
  packedByName: 'רב"ט ארז כהן',
  closedAt: new Date(2026, 8, 22, 12, 0).toISOString(),
  items: [item(1, 'מחשב נייד', 2), item(2, 'מסך', 1)],
  ...over,
});

describe('distributeVerdict', () => {
  it('opens a box that was received', () => {
    const v = distributeVerdict('10001', unit());
    expect(v.kind).toBe('open');
  });

  it('refuses a code that does not exist', () => {
    expect(distributeVerdict('99999', null)).toEqual({ kind: 'reject', messageHe: 'אריזה 99999 לא נמצאה' });
  });

  it.each<PackingUnitStatus>(['closed', 'in_transit', 'missing', 'distributed', 'distributed_short'])(
    'refuses a box in status %s and names that status in Hebrew',
    (status) => {
      expect(distributeVerdict('10001', unit({ status }))).toMatchObject({
        kind: 'reject',
        messageHe: expect.stringContaining('ניתן לפזר רק אריזה שהתקבלה'),
      });
    },
  );
});

describe('destinationLine', () => {
  it('reads building, floor and room in one line', () => {
    expect(destinationLine(unit())).toBe('בניין 7 · קומה 2 · חדר 214');
  });

  it('marks a part that is missing rather than printing null', () => {
    expect(destinationLine(unit({ destFloor: null }))).toBe('בניין 7 · — · חדר 214');
  });
});

describe('roomWarning', () => {
  it('says nothing while the room has not been confirmed', () => {
    expect(roomWarning(unit(), '')).toBeNull();
    expect(roomWarning(unit(), '   ')).toBeNull();
  });

  it('says nothing when the distributor is in the box destination room', () => {
    expect(roomWarning(unit(), 'חדר 214')).toBeNull();
    expect(roomWarning(unit(), '  חדר 214 ')).toBeNull();
  });

  // The distributor persona: "המערכת חייבת להתריע לי אם הארגז הזה מיועד לקומה אחרת".
  it('warns when the distributor is somewhere else, and still allows it', () => {
    expect(roomWarning(unit(), 'חדר 999')).toBe('האריזה מיועדת לחדר 214 — ודאו שאתם בחדר הנכון');
  });

  it('says nothing when the box has no destination room on file', () => {
    expect(roomWarning(unit({ destRoom: null }), 'חדר 999')).toBeNull();
  });
});

describe('needsItemStep', () => {
  // A personal carton has no packing_unit_items rows at all (spec §3).
  it('skips the item step for a box with no contents', () => {
    expect(needsItemStep(unit({ type: 'personal_carton', items: [] }))).toBe(false);
  });

  it('asks for the item step for a box with contents', () => {
    expect(needsItemStep(unit())).toBe(true);
  });
});

describe('maxFor', () => {
  it('is everything the box still holds', () => {
    expect(maxFor(item(1, 'מחשב נייד', 2))).toBe(2);
  });

  it('subtracts anything already handed over', () => {
    expect(maxFor({ ...item(1, 'מחשב נייד', 2), distributedQuantity: 1 })).toBe(1);
  });

  it('never goes below zero', () => {
    expect(maxFor({ ...item(1, 'מחשב נייד', 1), distributedQuantity: 3 })).toBe(0);
  });
});

describe('drafts', () => {
  // Conventions #5: zero by default, so nothing is confirmed that was not looked at.
  it('starts every item at zero', () => {
    expect(emptyDraft(unit().items)).toEqual({ 1: 0, 2: 0 });
  });

  it('fills every item to its maximum in one tap', () => {
    expect(fullDraft(unit().items)).toEqual({ 1: 2, 2: 1 });
  });
});

describe('shortfall', () => {
  it('is empty when everything was handed over', () => {
    expect(shortfall(unit().items, { 1: 2, 2: 1 })).toEqual([]);
  });

  it('names each item that is short and by how much', () => {
    const short = shortfall(unit().items, { 1: 1, 2: 1 });
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ missing: 1 });
    expect(short[0].item.name).toBe('מחשב נייד');
  });

  it('counts an item nobody ticked as entirely short', () => {
    expect(shortfall(unit().items, {}).map((s) => s.missing)).toEqual([2, 1]);
  });
});

describe('distributeRequest', () => {
  it('sends only what was actually handed over, with the room trimmed', () => {
    expect(distributeRequest({ 1: 2, 2: 0 }, '  חדר 214 ')).toEqual({
      items: [{ packingUnitItemId: 1, quantity: 2 }],
      atRoom: 'חדר 214',
    });
  });

  // Review Focus 5: an empty list is a real request, not a blocked one.
  it('sends an empty list when nothing was handed over', () => {
    expect(distributeRequest({ 1: 0 }, 'חדר 214')).toEqual({ items: [], atRoom: 'חדר 214' });
  });
});

describe('distributeSummary', () => {
  it('reports a box that was fully distributed', () => {
    const s = distributeSummary(unit({ status: 'distributed' }));
    expect(s).toMatchObject({ title: 'האריזה פוזרה במלואה', tone: 'ok' });
  });

  it('names every short item and turns the summary amber', () => {
    const s = distributeSummary(
      unit({
        status: 'distributed_short',
        items: [
          { ...item(1, 'מחשב נייד', 2), distributedQuantity: 1, itemStatus: 'short' },
          { ...item(2, 'מסך', 1), distributedQuantity: 1, itemStatus: 'distributed' },
        ],
      }),
    );
    expect(s).toMatchObject({ title: 'האריזה פוזרה עם חוסר', tone: 'warn' });
    expect(s.lines).toContain('מחשב נייד: פוזרו 1 מתוך 2');
    expect(s.lines.join(' ')).not.toContain('מסך');
  });

  // Review Focus 5: the same empty request means "distributed" for a personal carton.
  it('reports a personal carton as fully distributed, with no item lines', () => {
    const s = distributeSummary(unit({ type: 'personal_carton', status: 'distributed', items: [] }));
    expect(s).toMatchObject({ title: 'האריזה פוזרה במלואה', tone: 'ok' });
    expect(s.lines).toEqual(['מספר אריזה: 10001']);
  });

  it('does not guess a status the server did not return', () => {
    const s = distributeSummary(unit({ status: 'received' }));
    expect(s.tone).toBe('warn');
    expect(s.title).toBe('הפיזור לא הושלם');
  });
});
