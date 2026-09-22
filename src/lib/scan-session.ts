/**
 * The shared scanning primitive for the load, receive and distribute flows.
 * Pure: no React, no DOM, no network — everything here is decided from arguments.
 */

export const CODE_LENGTH = 5;

/**
 * Turns a camera decode or a typed entry into a box code, or null if it is not one.
 * Separators are stripped so a keypad entry like "1-00-01" still works, but the
 * result must be exactly five digits — a QR carrying a URL is not a box label.
 */
export function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim();
  // Reject before stripping: a URL with digits in it must not become a code.
  if (!/^[\d\s.\-/]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === CODE_LENGTH ? digits : null;
}

/** Adds a code once. Re-scanning an already-counted box is a friendly no-op (spec §5.5). */
export function addCode(
  codes: string[],
  code: string,
): { codes: string[]; verdict: 'accepted' | 'duplicate' } {
  if (codes.includes(code)) return { codes, verdict: 'duplicate' };
  return { codes: [...codes, code], verdict: 'accepted' };
}

export function removeCode(codes: string[], code: string): string[] {
  return codes.filter((c) => c !== code);
}

/** How long the same QR must be out of frame before a repeat counts as a new scan. */
export const REPEAT_SCAN_MS = 1500;

/**
 * html5-qrcode reports a decode on every frame the QR is visible — about ten a second.
 * Without this, one box held steady produces ten beeps and ten lookups.
 */
export function shouldAcceptDecode(
  last: { code: string; at: number } | null,
  code: string,
  now: number,
): boolean {
  if (!last || last.code !== code) return true;
  return now - last.at >= REPEAT_SCAN_MS;
}
