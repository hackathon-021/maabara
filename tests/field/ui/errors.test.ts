import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { describeError } from '@/components/ui/errors';

describe('describeError', () => {
  it('shows the server Hebrew message for a domain error', () => {
    const e = new ApiClientError('ROOM_NOT_MAPPED', 'יש לסיים את המיפוי', 409);
    expect(describeError(e)).toEqual({ messageHe: 'יש לסיים את המיפוי', redirectTo: null });
  });

  it('sends an expired session back to sign-in', () => {
    const e = new ApiClientError('UNAUTHENTICATED', 'יש להתחבר מחדש', 401);
    expect(describeError(e)).toEqual({ messageHe: 'יש להתחבר מחדש', redirectTo: '/login' });
  });

  it('falls back to a Hebrew network message for a plain error', () => {
    expect(describeError(new Error('fetch failed'))).toEqual({
      messageHe: 'אין תקשורת עם השרת, נסו שוב',
      redirectTo: null,
    });
  });

  it('never leaks a non-Error throw to the screen', () => {
    expect(describeError('boom').messageHe).toBe('אין תקשורת עם השרת, נסו שוב');
    expect(describeError(undefined).messageHe).toBe('אין תקשורת עם השרת, נסו שוב');
  });
});
