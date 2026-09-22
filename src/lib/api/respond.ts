import { ZodError } from 'zod';
import type { ApiError } from '@/lib/contracts';
import { AppError } from '@/lib/errors';

/** Wraps a route handler body: JSON on success, the standard error body on failure. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof AppError) {
      const body: ApiError = { error: e.code, messageHe: e.messageHe };
      return Response.json(body, { status: e.status });
    }
    if (e instanceof ZodError) {
      const body: ApiError = { error: 'VALIDATION', messageHe: 'נתונים חסרים או שגויים' };
      return Response.json(body, { status: 400 });
    }
    console.error(e);
    const body: ApiError = { error: 'INTERNAL', messageHe: 'אירעה שגיאה, נסו שוב' };
    return Response.json(body, { status: 500 });
  }
}
