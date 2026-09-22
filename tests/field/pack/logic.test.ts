import { describe, expect, it } from 'vitest';
import type { ClosePackingUnitResult, PackableItemDTO, PackingUnitDTO, PackingUnitItemDTO, RoomDTO } from '@/lib/contracts';
import {
  canLeaveContents,
  completionSummary,
  draftToRequest,
  draftTotal,
  isRoomPackable,
  itemRows,
  needsItems,
  normalizeDestination,
  roomHintHe,
} from '@/app/field/pack/logic';

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

const unit = (over: Partial<PackingUnitDTO> = {}): PackingUnitDTO => ({
  id: 1,
  code: '10001',
  type: 'professional_carton',
  status: 'closed',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: 'רס"ל דנה כהן',
  transportUnitId: null,
  packedByName: 'רב"ט ארז כהן',
  closedAt: '2026-09-22T10:00:00.000Z',
  items: [],
  ...over,
});

describe('normalizeDestination', () => {
  it('trims every field before it reaches the server', () => {
    expect(normalizeDestination({ destBuilding: ' בניין 7 ', destFloor: 'קומה 2', destRoom: ' חדר 214' })).toEqual({
      destBuilding: 'בניין 7',
      destFloor: 'קומה 2',
      destRoom: 'חדר 214',
    });
  });

  // Review Focus 4: a box addressed to three spaces cannot be delivered.
  it('rejects a field that is only whitespace', () => {
    expect(normalizeDestination({ destBuilding: '   ', destFloor: 'קומה 2', destRoom: 'חדר 214' })).toBeNull();
    expect(normalizeDestination({ destBuilding: 'בניין 7', destFloor: '', destRoom: 'חדר 214' })).toBeNull();
    expect(normalizeDestination({ destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: '\t' })).toBeNull();
  });
});

describe('completionSummary', () => {
  it('reports the code and the remaining work when the room is still being packed', () => {
    const result: ClosePackingUnitResult = {
      unit: unit(),
      roomCheck: { remaining: 2, disposalRemaining: 0, roomStatus: 'packing' },
    };
    const s = completionSummary(result);
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.lines[0]).toBe('מספר אריזה: 10001');
    expect(s.lines).toContain('נותרו בחדר 2 פריטים לאריזה');
    expect(s).toMatchObject({ tone: 'ok', canPackMore: true });
  });

  it('announces a closed room when the server closed it', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 0, roomStatus: 'closed' },
    });
    expect(s.title).toBe('חדר סגור');
    expect(s.lines).toContain('כל הפריטים בחדר נארזו');
    expect(s.canPackMore).toBe(false);
  });

  it('announces a room waiting for disposal and says how much is left', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 1, roomStatus: 'awaiting_disposal' },
    });
    expect(s.title).toBe('ממתין לגריטה');
    expect(s.lines).toContain('נותרו בחדר 1 פריטים לגריטה');
    expect(s).toMatchObject({ tone: 'warn', canPackMore: false });
  });

  // Review Focus 5: a personal carton gets no room check at all.
  it('never prints a null room check for a personal carton', () => {
    const s = completionSummary({ unit: unit({ type: 'personal_carton' }), roomCheck: null });
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.lines.join(' ')).not.toContain('null');
    expect(s.lines).toEqual(['מספר אריזה: 10001']);
    expect(s.canPackMore).toBe(true);
  });

  // Review Focus 5: nothing left, but the server left the room open.
  it('does not claim the room closed when the server kept it packing', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 0, roomStatus: 'packing' },
    });
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.canPackMore).toBe(true);
  });

  it('survives a box that somehow came back without a code', () => {
    const s = completionSummary({ unit: unit({ code: null }), roomCheck: null });
    expect(s.lines[0]).toBe('מספר אריזה: —');
  });
});

import { labelLines } from '@/app/field/pack/logic';

describe('labelLines', () => {
  it('carries everything the flow says a label must show', () => {
    expect(labelLines(unit())).toEqual([
      { label: 'יעד', value: 'בניין 7 · קומה 2 · חדר 214' },
      { label: 'נארז מחדר', value: 'חדר 101' },
      { label: 'מדור', value: 'ענף תקשוב — מדור מערכות' },
      { label: 'אחראי חדר', value: 'רס"ל דנה כהן' },
      { label: 'ארז', value: 'רב"ט ארז כהן' },
    ]);
  });

  it('marks an unknown destination part rather than printing "null"', () => {
    const lines = labelLines(unit({ destFloor: null }));
    expect(lines[0].value).toBe('בניין 7 · — · חדר 214');
  });

  it('drops the room-manager line when nobody is on file', () => {
    expect(labelLines(unit({ roomManager: null })).map((l) => l.label)).toEqual([
      'יעד',
      'נארז מחדר',
      'מדור',
      'ארז',
    ]);
  });
});
