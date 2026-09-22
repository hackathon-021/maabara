import { describe, expect, it } from 'vitest';
import { addCode, normalizeCode, removeCode, REPEAT_SCAN_MS, shouldAcceptDecode } from '@/lib/scan-session';

describe('normalizeCode', () => {
  it('accepts a bare five-digit code', () => {
    expect(normalizeCode('10001')).toBe('10001');
  });

  // The column is CHAR(5) and a camera decode can carry a trailing newline.
  it('strips whitespace and separators around and inside the digits', () => {
    expect(normalizeCode('  10001 ')).toBe('10001');
    expect(normalizeCode('10001\n')).toBe('10001');
    expect(normalizeCode('1-00-01')).toBe('10001');
  });

  it('refuses anything that is not exactly five digits', () => {
    expect(normalizeCode('1234')).toBeNull();
    expect(normalizeCode('123456')).toBeNull();
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode('abcde')).toBeNull();
  });

  // P3's label encodes the bare code. A URL in the QR is somebody else's sticker.
  it('refuses a URL that happens to contain five digits', () => {
    expect(normalizeCode('https://example.test/box/10001')).toBeNull();
  });
});

describe('addCode', () => {
  it('appends a new code in scan order', () => {
    expect(addCode(['10001'], '10002')).toEqual({ codes: ['10001', '10002'], verdict: 'accepted' });
  });

  it('reports a re-scan as a duplicate and returns the same array', () => {
    const codes = ['10001'];
    const result = addCode(codes, '10001');
    expect(result.verdict).toBe('duplicate');
    // Same reference: a re-scan must not re-render the list under the unloader's thumb.
    expect(result.codes).toBe(codes);
  });
});

describe('removeCode', () => {
  it('takes a code back out and leaves the rest in order', () => {
    expect(removeCode(['10001', '10002', '10003'], '10002')).toEqual(['10001', '10003']);
  });

  it('is a no-op for a code that was never there', () => {
    expect(removeCode(['10001'], '99999')).toEqual(['10001']);
  });
});

describe('shouldAcceptDecode', () => {
  // Review Focus 1: html5-qrcode fires ~10 times a second on the same QR.
  it('accepts the first decode of anything', () => {
    expect(shouldAcceptDecode(null, '10001', 1_000)).toBe(true);
  });

  it('ignores the same code again while the camera is still on it', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10001', 1_100)).toBe(false);
  });

  it('accepts the same code once the camera has been off it', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10001', 1_000 + REPEAT_SCAN_MS)).toBe(true);
  });

  it('accepts a different code immediately', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10002', 1_010)).toBe(true);
  });
});
