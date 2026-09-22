import { describe, expect, it } from 'vitest';
import { formatHeDateTime } from '@/app/field/format';

describe('formatHeDateTime', () => {
  it('shows a day, a month and a time', () => {
    // Built from local parts so the assertion holds in any timezone.
    const iso = new Date(2026, 8, 22, 14, 5).toISOString();
    expect(formatHeDateTime(iso)).toBe('22/09 14:05');
  });

  it('pads single digits', () => {
    const iso = new Date(2026, 0, 3, 9, 7).toISOString();
    expect(formatHeDateTime(iso)).toBe('03/01 09:07');
  });

  it('shows a dash for a timestamp that is not set yet', () => {
    expect(formatHeDateTime(null)).toBe('—');
  });
});
