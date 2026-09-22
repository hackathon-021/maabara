'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { feedback } from '@/lib/feedback';
import { describeError } from './errors';

/**
 * One busy flag, one Hebrew error line, one sound per user action.
 * Every write on a field screen goes through `run` so no screen invents its own
 * error handling and no thrown error reaches React as a blank page.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, onOk?: (value: T) => void): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const value = await fn();
        feedback('success');
        onOk?.(value);
        return value;
      } catch (e) {
        const failure = describeError(e);
        setError(failure.messageHe);
        feedback('error');
        if (failure.redirectTo) router.push(failure.redirectTo);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, setError, run };
}
