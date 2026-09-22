import { describe, expect, it } from 'vitest';
import { transportRequest } from '@/app/field/load/logic';

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
