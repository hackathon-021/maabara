import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { Errors } from '@/lib/errors';

describe('handle', () => {
  it('returns JSON 200 on success', async () => {
    const res = await handle(async () => ({ ok: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('maps AppError to its status and the standard body', async () => {
    const res = await handle(async () => {
      throw Errors.roomNotMapped();
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'ROOM_NOT_MAPPED', messageHe: 'יש לסיים את המיפוי' });
  });

  it('maps ZodError to 400 VALIDATION', async () => {
    const res = await handle(async () => z.object({ a: z.number() }).parse({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION');
  });

  it('maps unknown errors to 500 INTERNAL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('INTERNAL');
  });
});
