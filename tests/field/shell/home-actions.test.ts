import { describe, expect, it } from 'vitest';
import { FIELD_ACTIONS, homeActions } from '@/app/field/home-actions';

describe('homeActions', () => {
  it('puts the packer straight on the packing action', () => {
    const { primary, others } = homeActions('packer');
    expect(primary?.href).toBe('/field/pack');
    expect(primary?.title).toBe('אריזת ציוד');
    expect(others.map((a) => a.href)).toEqual(['/field/load', '/field/receive', '/field/distribute']);
  });

  it('matches every field role to its own action', () => {
    expect(homeActions('transporter').primary?.href).toBe('/field/load');
    expect(homeActions('unloader').primary?.href).toBe('/field/receive');
    expect(homeActions('distributor').primary?.href).toBe('/field/distribute');
  });

  it('offers a commander every action and singles none out', () => {
    const { primary, others } = homeActions('commander');
    expect(primary).toBeNull();
    expect(others).toEqual(FIELD_ACTIONS);
  });

  it('offers a roleless user every action rather than an empty screen', () => {
    expect(homeActions(null).others).toEqual(FIELD_ACTIONS);
  });

  it('always offers all four actions between primary and others', () => {
    for (const role of ['packer', 'transporter', 'unloader', 'distributor'] as const) {
      const { primary, others } = homeActions(role);
      expect([primary, ...others].filter(Boolean)).toHaveLength(FIELD_ACTIONS.length);
    }
  });
});
