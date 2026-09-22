import { describe, expect, it } from 'vitest';
import { clamp, statusTone } from '@/components/ui/logic';

describe('clamp', () => {
  it('keeps a value inside its bounds', () => {
    expect(clamp(3, 0, 5)).toBe(3);
    expect(clamp(-2, 0, 5)).toBe(0);
    expect(clamp(9, 0, 5)).toBe(5);
  });

  it('never returns a fraction or NaN from a typed-in value', () => {
    expect(clamp(2.7, 0, 5)).toBe(2);
    expect(clamp(Number.NaN, 0, 5)).toBe(0);
  });

  it('collapses to the minimum when max is below min (an item with nothing left)', () => {
    expect(clamp(4, 0, 0)).toBe(0);
  });
});

describe('statusTone', () => {
  it('paints the loss statuses red and the shortage statuses amber', () => {
    expect(statusTone('missing')).toBe('danger');
    expect(statusTone('short')).toBe('danger');
    expect(statusTone('distributed_short')).toBe('warn');
  });

  it('paints completed statuses green', () => {
    expect(statusTone('received')).toBe('ok');
    expect(statusTone('distributed')).toBe('ok');
    expect(statusTone('released')).toBe('ok');
  });

  it('paints in-flight statuses as info and everything else neutral', () => {
    expect(statusTone('in_transit')).toBe('info');
    expect(statusTone('open')).toBe('neutral');
    expect(statusTone('something_new')).toBe('neutral');
  });
});
