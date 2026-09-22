import { describe, expect, it } from 'vitest';
import type { PackingUnitSummaryDTO, TransportUnitDTO } from '@/lib/contracts';
import { classifyLoadScan, loadSummary, transportRequest } from '@/app/field/load/logic';

const draft = (over: Partial<Parameters<typeof transportRequest>[0]> = {}) => ({
  type: 'truck' as const,
  typeDetails: '',
  licensePlate: '12-345-67',
  groupId: 1,
  ...over,
});

describe('transportRequest', () => {
  it('builds a truck request', () => {
    expect(transportRequest(draft())).toEqual({ type: 'truck', licensePlate: '12-345-67', groupId: 1 });
  });

  it('trims the licence plate', () => {
    expect(transportRequest(draft({ licensePlate: '  12-345-67 ' }))?.licensePlate).toBe('12-345-67');
  });

  it('refuses a blank or whitespace-only licence plate', () => {
    expect(transportRequest(draft({ licensePlate: '' }))).toBeNull();
    expect(transportRequest(draft({ licensePlate: '   ' }))).toBeNull();
  });

  it('refuses until a type and a group are chosen', () => {
    expect(transportRequest(draft({ type: null }))).toBeNull();
    expect(transportRequest(draft({ groupId: null }))).toBeNull();
  });

  // flows/transporting_flow.md note Zn: choosing "אחר" means saying what it is.
  it('requires details for a transport that is not a truck', () => {
    expect(transportRequest(draft({ type: 'other', typeDetails: '' }))).toBeNull();
    expect(transportRequest(draft({ type: 'other', typeDetails: '  ' }))).toBeNull();
    expect(transportRequest(draft({ type: 'other', typeDetails: ' רכב פרטי ' }))).toEqual({
      type: 'other',
      typeDetails: 'רכב פרטי',
      licensePlate: '12-345-67',
      groupId: 1,
    });
  });

  it('drops details left behind after switching back to a truck', () => {
    expect(transportRequest(draft({ type: 'truck', typeDetails: 'רכב פרטי' }))).toEqual({
      type: 'truck',
      licensePlate: '12-345-67',
      groupId: 1,
    });
  });
});

const box = (code: string): PackingUnitSummaryDTO => ({
  id: Number(code),
  code,
  type: 'professional_carton',
  status: 'closed',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
});

describe('classifyLoadScan', () => {
  const available = [box('10001'), box('10002')];

  it('accepts a closed box that is not picked yet', () => {
    expect(classifyLoadScan('10001', available, [])).toMatchObject({ kind: 'accepted', code: '10001' });
  });

  it('tolerates whitespace around a scanned code', () => {
    expect(classifyLoadScan(' 10001 ', available, [])).toMatchObject({ kind: 'accepted', code: '10001' });
  });

  it('refuses something that is not a five-digit code', () => {
    const scan = classifyLoadScan('123', available, []);
    expect(scan.kind).toBe('invalid');
    expect(scan.messageHe).toBe('יש להזין מספר אריזה בן 5 ספרות');
  });

  // spec §5.5: a re-scan is friendly, not an error.
  it('reports a box already on the list as a duplicate', () => {
    const scan = classifyLoadScan('10001', available, ['10001']);
    expect(scan).toMatchObject({ kind: 'duplicate', code: '10001' });
    expect(scan.messageHe).toBe('אריזה 10001 כבר בהעמסה');
  });

  /**
   * Review Focus 4: a box on another truck, or one never closed, is simply absent
   * from the closed list. P2 would reject the entire load for it, so it never
   * reaches the accumulated codes.
   */
  it('refuses a code that is not available for loading', () => {
    const scan = classifyLoadScan('99999', available, []);
    expect(scan.kind).toBe('unknown');
    expect(scan.messageHe).toBe('אריזה 99999 אינה זמינה להעמסה');
  });

  it('refuses everything while the available list is still empty', () => {
    expect(classifyLoadScan('10001', [], []).kind).toBe('unknown');
  });
});

describe('loadSummary', () => {
  const truck = (over: Partial<TransportUnitDTO> = {}): TransportUnitDTO => ({
    id: 1,
    type: 'truck',
    typeDetails: null,
    licensePlate: '12-345-67',
    groupId: 1,
    status: 'in_transit',
    createdAt: new Date(2026, 8, 22, 13, 0).toISOString(),
    departedAt: new Date(2026, 8, 22, 14, 5).toISOString(),
    releasedAt: null,
    boxes: [box('10001'), box('10002')],
    ...over,
  });

  // flows/transporting_flow.md note AEn1: plate, box count, date and time.
  it('reports the plate, the box count and the departure time', () => {
    expect(loadSummary(truck())).toEqual({
      title: 'יחידת הובלה הועמסה',
      lines: ['מספר רישוי: 12-345-67', '2 אריזות', 'יציאה: 22/09 14:05'],
    });
  });

  it('names the transport when it is not a truck', () => {
    const s = loadSummary(truck({ type: 'other', typeDetails: 'רכב פרטי' }));
    expect(s.lines).toContain('סוג: רכב פרטי');
  });

  it('does not invent a departure time it was not given', () => {
    expect(loadSummary(truck({ departedAt: null })).lines).toContain('יציאה: —');
  });
});
