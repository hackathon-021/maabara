import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { assertTransition, TRANSPORT_UNLOADED } from '@/lib/lifecycle/transitions';

describe('assertTransition', () => {
  it('allows every legal packing-unit step of the chain', () => {
    expect(() => assertTransition('packing_unit', 'open', 'closed')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'closed', 'in_transit')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'in_transit', 'received')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'in_transit', 'missing')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'received', 'distributed')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'received', 'distributed_short')).not.toThrow();
  });

  it('treats a null from-status as creation', () => {
    expect(() => assertTransition('packing_unit', null, 'open')).not.toThrow();
    expect(() => assertTransition('packing_unit_item', null, 'packed')).not.toThrow();
  });

  it('rejects skipping a step, with both Hebrew labels in the message', () => {
    try {
      assertTransition('packing_unit', 'open', 'received');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('ILLEGAL_TRANSITION');
      expect(err.status).toBe(409);
      expect(err.messageHe).toContain('אריזה בתהליך');
      expect(err.messageHe).toContain('אריזה התקבלה');
    }
  });

  it('rejects re-applying the same status', () => {
    expect(() => assertTransition('packing_unit', 'in_transit', 'in_transit')).toThrow(AppError);
  });

  it('rejects leaving a terminal status', () => {
    expect(() => assertTransition('packing_unit', 'missing', 'received')).toThrow(AppError);
    expect(() => assertTransition('packing_unit', 'distributed', 'received')).toThrow(AppError);
    expect(() => assertTransition('packing_unit_item', 'short', 'distributed')).toThrow(AppError);
  });

  it('routes a transport unit through the unloaded pseudo-status', () => {
    expect(() => assertTransition('transport_unit', 'loading', 'in_transit')).not.toThrow();
    expect(() => assertTransition('transport_unit', 'in_transit', TRANSPORT_UNLOADED)).not.toThrow();
    expect(() => assertTransition('transport_unit', TRANSPORT_UNLOADED, 'released')).not.toThrow();
    expect(() => assertTransition('transport_unit', 'in_transit', 'released')).toThrow(AppError);
  });

  it('knows the room closing steps', () => {
    expect(() => assertTransition('room', 'done', 'packing')).not.toThrow();
    expect(() => assertTransition('room', 'packing', 'closed')).not.toThrow();
    expect(() => assertTransition('room', 'packing', 'awaiting_disposal')).not.toThrow();
    expect(() => assertTransition('room', 'waiting', 'packing')).toThrow(AppError);
  });
});
