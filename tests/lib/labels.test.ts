import { describe, expect, it } from 'vitest';
import { statusLabel } from '@/lib/labels';

describe('statusLabel', () => {
  it('resolves by entity type', () => {
    expect(statusLabel('packing_unit', 'in_transit')).toBe('אריזה בדרך');
    expect(statusLabel('transport_unit', 'in_transit')).toBe('יחידת הובלה בדרך');
  });
  it('knows the unloaded pseudo-status', () => {
    expect(statusLabel('transport_unit', 'unloaded')).toBe('יחידת הובלה נפרקה במלואה');
  });
  it('falls back to the raw value and handles null', () => {
    expect(statusLabel('room', 'weird')).toBe('weird');
    expect(statusLabel('room', null)).toBe('—');
  });
});
