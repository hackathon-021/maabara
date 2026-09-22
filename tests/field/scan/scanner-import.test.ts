import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scanner = readFileSync('src/components/Scanner.tsx', 'utf8');

describe('Scanner', () => {
  /**
   * html5-qrcode touches `document` while it is being imported. A top-level import
   * therefore runs during Next's server render and breaks `npm run build` —
   * on the deploy, not on the laptop where it was written.
   */
  it('loads html5-qrcode dynamically, never at module scope', () => {
    expect(scanner).not.toMatch(/^import .*html5-qrcode/m);
    expect(scanner).toContain("await import('html5-qrcode')");
  });

  it('is a client component', () => {
    expect(scanner.startsWith("'use client'")).toBe(true);
  });

  // Review Focus 2: a camera that never starts must not take the screen with it.
  it('handles a camera that refuses to start', () => {
    expect(scanner).toContain('onUnavailable');
    expect(scanner).toMatch(/catch/);
  });
});
