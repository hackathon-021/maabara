import { describe, expect, it } from 'vitest';
import type { PackingUnitDTO, PackingUnitStatus, TransportUnitDTO } from '@/lib/contracts';
import {
  classifyReceiveScan,
  expectedCodes,
  surplusVerdict,
  unconfirmedCodes,
} from '@/app/field/receive/logic';

const summary = (code: string | null) => ({
  id: 1,
  code,
  type: 'professional_carton' as const,
  status: 'in_transit' as const,
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
});

const truck = (codes: (string | null)[]): TransportUnitDTO => ({
  id: 1,
  type: 'truck',
  typeDetails: null,
  licensePlate: '12-345-67',
  groupId: 1,
  status: 'in_transit',
  createdAt: new Date(2026, 8, 22, 13, 0).toISOString(),
  departedAt: new Date(2026, 8, 22, 14, 5).toISOString(),
  releasedAt: null,
  boxes: codes.map(summary),
});

const box = (status: PackingUnitStatus): PackingUnitDTO => ({
  ...summary('10009'),
  status,
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: null,
  transportUnitId: 2,
  packedByName: 'רב"ט ארז כהן',
  closedAt: new Date(2026, 8, 22, 12, 0).toISOString(),
  items: [],
});

describe('expectedCodes', () => {
  it('lists the codes of the boxes on the truck', () => {
    expect(expectedCodes(truck(['10001', '10002']))).toEqual(['10001', '10002']);
  });

  it('ignores a box that somehow has no code', () => {
    expect(expectedCodes(truck(['10001', null]))).toEqual(['10001']);
  });
});

describe('classifyReceiveScan', () => {
  const expected = ['10001', '10002'];

  it('confirms a box that is on this truck', () => {
    expect(classifyReceiveScan('10001', expected, [], [])).toMatchObject({ kind: 'confirmed', code: '10001' });
  });

  it('refuses something that is not a five-digit code', () => {
    expect(classifyReceiveScan('12', expected, [], []).kind).toBe('invalid');
  });

  it('treats a re-scan of a confirmed box as a friendly duplicate', () => {
    expect(classifyReceiveScan('10001', expected, ['10001'], [])).toEqual({
      kind: 'duplicate',
      code: '10001',
      messageHe: 'אריזה 10001 כבר סומנה',
    });
  });

  it('treats a re-scan of an accepted surplus box as a duplicate too', () => {
    expect(classifyReceiveScan('10009', expected, [], ['10009']).kind).toBe('duplicate');
  });

  it('sends a code that is not on this truck off for a lookup', () => {
    expect(classifyReceiveScan('10009', expected, [], [])).toEqual({ kind: 'offsite', code: '10009' });
  });
});

describe('surplusVerdict', () => {
  /**
   * Review Focus 3: only a box the server will actually accept may be offered as surplus.
   * Anything else turns one stray scan into a failed unload for the whole truck.
   */
  it('offers a box that is in transit on another truck', () => {
    const v = surplusVerdict('10009', box('in_transit'));
    expect(v.kind).toBe('offer');
    expect(v.messageHe).toBe('אריזה 10009 לא הועמסה על יחידת הובלה זו. לקבל בכל זאת?');
  });

  it('rejects a code that does not exist', () => {
    expect(surplusVerdict('99999', null)).toEqual({ kind: 'reject', messageHe: 'אריזה 99999 לא נמצאה' });
  });

  it('rejects a box that is still closed at the source', () => {
    const v = surplusVerdict('10009', box('closed'));
    expect(v.kind).toBe('reject');
    expect(v.messageHe).toContain('אריזה נסגרה');
  });

  it('rejects a box that was already received', () => {
    const v = surplusVerdict('10009', box('received'));
    expect(v.kind).toBe('reject');
    expect(v.messageHe).toContain('אריזה התקבלה');
  });

  it('rejects a box already marked missing', () => {
    expect(surplusVerdict('10009', box('missing')).kind).toBe('reject');
  });
});

describe('unconfirmedCodes', () => {
  it('names what has not come off the truck yet, in loading order', () => {
    expect(unconfirmedCodes(['10001', '10002', '10003'], ['10002'])).toEqual(['10001', '10003']);
  });

  it('is empty once everything is confirmed', () => {
    expect(unconfirmedCodes(['10001'], ['10001'])).toEqual([]);
  });
});
