import { ApiClientError } from '@/lib/api/client';

export interface ActionFailure {
  /** Hebrew, safe to render straight onto a field screen. */
  messageHe: string;
  /** Where the user must be sent for this to be recoverable, or null to stay put. */
  redirectTo: string | null;
}

const NETWORK_FAILURE = 'אין תקשורת עם השרת, נסו שוב';

export function describeError(e: unknown): ActionFailure {
  if (e instanceof ApiClientError) {
    return { messageHe: e.messageHe, redirectTo: e.code === 'UNAUTHENTICATED' ? '/login' : null };
  }
  // A thrown string, a TypeError from fetch, an aborted request — all the same to a packer.
  return { messageHe: NETWORK_FAILURE, redirectTo: null };
}
