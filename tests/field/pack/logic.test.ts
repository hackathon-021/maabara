import { describe, expect, it } from 'vitest';
import type { PackableItemDTO, PackingUnitItemDTO, RoomDTO } from '@/lib/contracts';
import { canLeaveContents, draftToRequest, draftTotal, isRoomPackable, itemRows, needsItems, roomHintHe } from '@/app/field/pack/logic';

const room = (status: RoomDTO['status'], roomManager: string | null = 'רס"ל דנה כהן'): RoomDTO => ({
  id: 1,
  groupId: 1,
  description: 'חדר 101',
  status,
  roomManager,
});

describe('isRoomPackable', () => {
  it('allows the two statuses that finished mapping', () => {
    expect(isRoomPackable('done')).toBe(true);
    expect(isRoomPackable('packing')).toBe(true);
  });

  it('blocks a room that has not finished mapping', () => {
    expect(isRoomPackable('waiting')).toBe(false);
    expect(isRoomPackable('inProgress')).toBe(false);
  });

  it('blocks a room that is already finished', () => {
    expect(isRoomPackable('closed')).toBe(false);
    expect(isRoomPackable('awaiting_disposal')).toBe(false);
  });
});

describe('roomHintHe', () => {
  it('names the room manager when the room can be packed', () => {
    expect(roomHintHe(room('done'))).toBe('אחראי חדר: רס"ל דנה כהן');
  });

  it('says nothing when a packable room has no manager on file', () => {
    expect(roomHintHe(room('done', null))).toBeNull();
  });

  it('explains an unmapped room in the words the flow specifies', () => {
    expect(roomHintHe(room('waiting'))).toBe('יש לסיים את המיפוי');
    expect(roomHintHe(room('inProgress'))).toBe('יש לסיים את המיפוי');
  });

  it('explains a room that is already done with its own status label', () => {
    expect(roomHintHe(room('closed'))).toBe('חדר סגור');
    expect(roomHintHe(room('awaiting_disposal'))).toBe('ממתין לגריטה');
  });
});

describe('needsItems', () => {
  it('skips the contents step only for a personal carton', () => {
    expect(needsItems('personal_carton')).toBe(false);
    expect(needsItems('professional_carton')).toBe(true);
    expect(needsItems('pallet')).toBe(true);
    expect(needsItems('trolley')).toBe(true);
    expect(needsItems('loose')).toBe(true);
  });
});

const packable = (mappingReportId: number, name: string, remaining: number, status: 'transfer' | 'salvage' = 'transfer'): PackableItemDTO => ({
  mappingReportId,
  name,
  serial: null,
  status,
  remaining,
});

const saved = (id: number, mappingReportId: number, name: string, quantity: number): PackingUnitItemDTO => ({
  id,
  mappingReportId,
  name,
  serial: null,
  quantity,
  distributedQuantity: 0,
  itemStatus: 'packed',
});

describe('itemRows', () => {
  it('offers everything remaining in the room when the box is empty', () => {
    const rows = itemRows([packable(10, 'מחשב נייד', 2), packable(11, 'מסך', 1, 'salvage')], []);
    expect(rows).toEqual([
      { mappingReportId: 10, name: 'מחשב נייד', serial: null, status: 'transfer', max: 2, initial: 0 },
      { mappingReportId: 11, name: 'מסך', serial: null, status: 'salvage', max: 1, initial: 0 },
    ]);
  });

  // Review Focus 1: the server already subtracted this box's own rows.
  it('adds this box own saved quantity back onto the maximum', () => {
    const rows = itemRows([packable(10, 'מחשב נייד', 1)], [saved(5, 10, 'מחשב נייד', 1)]);
    expect(rows[0]).toMatchObject({ max: 2, initial: 1 });
  });

  // Review Focus 1: at remaining 0 the server stops listing the item entirely.
  it('still lists an item whose whole remaining quantity is already in this box', () => {
    const rows = itemRows([packable(11, 'מסך', 1)], [saved(5, 10, 'מחשב נייד', 2)]);
    expect(rows.map((r) => r.mappingReportId).sort()).toEqual([10, 11]);
    const laptop = rows.find((r) => r.mappingReportId === 10);
    expect(laptop).toMatchObject({ max: 2, initial: 2, name: 'מחשב נייד', status: null });
  });

  it('sorts by name so the screen order never jumps between visits', () => {
    const rows = itemRows([packable(11, 'מסך', 1), packable(10, 'כיסא', 1)], []);
    expect(rows.map((r) => r.name)).toEqual(['כיסא', 'מסך']);
  });

  it('returns nothing for a room with nothing left to pack', () => {
    expect(itemRows([], [])).toEqual([]);
  });
});

describe('draftToRequest', () => {
  it('sends only the items the packer actually put in the box', () => {
    expect(draftToRequest({ 10: 2, 11: 0, 12: 1 })).toEqual({
      items: [
        { mappingReportId: 10, quantity: 2 },
        { mappingReportId: 12, quantity: 1 },
      ],
    });
  });

  it('sends an empty list when the box was emptied', () => {
    expect(draftToRequest({ 10: 0 })).toEqual({ items: [] });
  });
});

describe('draftTotal', () => {
  it('counts every unit in the box', () => {
    expect(draftTotal({ 10: 2, 11: 0, 12: 3 })).toBe(5);
    expect(draftTotal({})).toBe(0);
  });
});

describe('canLeaveContents', () => {
  // Review Focus 3: the server rejects an empty non-personal box with
  // "יש לבחור פריטים לאריזה" — never let the packer walk into that.
  it('requires at least one item in a non-personal box', () => {
    expect(canLeaveContents('professional_carton', {})).toBe(false);
    expect(canLeaveContents('professional_carton', { 10: 0 })).toBe(false);
    expect(canLeaveContents('professional_carton', { 10: 1 })).toBe(true);
  });

  it('lets a personal carton through with no contents at all', () => {
    expect(canLeaveContents('personal_carton', {})).toBe(true);
  });
});
