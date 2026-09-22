import { describe, expect, it } from 'vitest';
import type { RoomDTO } from '@/lib/contracts';
import { isRoomPackable, needsItems, roomHintHe } from '@/app/field/pack/logic';

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
