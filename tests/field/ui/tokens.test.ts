import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');

describe('design tokens', () => {
  // Exact values from design/design.md — do not "adjust" one without changing the design doc.
  it.each([
    ['--color-primary', '#5F42FF'],
    ['--color-primary-soft', '#D7D0FF'],
    ['--color-page', '#665FB3'],
    ['--color-surface', '#FFFFFF'],
    ['--color-subtle', '#E5E5EA'],
    ['--color-link', '#005DF5'],
    ['--color-ink', '#1A1A1A'],
  ])('defines %s as %s', (token, hex) => {
    expect(css).toContain(`${token}: ${hex}`);
  });

  it('exposes the Heebo variable as the sans font', () => {
    expect(css).toContain('--font-sans: var(--font-heebo)');
  });

  it('has no dark-mode override — the field app is one fixed theme', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
});

describe('root layout', () => {
  it('is Hebrew and right-to-left', () => {
    expect(layout).toContain('lang="he"');
    expect(layout).toContain('dir="rtl"');
  });
});
