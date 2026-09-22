import { describe, expect, it } from 'vitest';
import type { PackingUnitDTO, PackingUnitItemDTO, PackingUnitStatus } from '@/lib/contracts';
import {
  destinationLine,
  distributeVerdict,
  needsItemStep,
  roomWarning,
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
