'use client';

import { Banner, Button, Card } from '@/components/ui';

/**
 * flows/unloading_flow.md nodes I–K: before anything is written, the unloader is
 * shown exactly which boxes are about to be recorded as missing, and gets one more
 * chance to find them. Nothing has been sent yet at this point.
 */
export function ReceiveRecheck({
  missing,
  onFound,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  missing: string[];
  onFound: (code: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warn" title="שים לב, לא כל האריזות נפרקו">
        האריזות הבאות יירשמו כחסרות. כדאי לבדוק שוב לפני סיום.
      </Banner>

      <Card>
        <ul className="flex flex-col gap-2">
          {missing.map((code) => (
            <li key={code} className="flex flex-col gap-2 rounded-card border-2 border-subtle p-3">
              <span className="text-lg font-bold tabular-nums">{code}</span>
              <Button variant="secondary" size="md" onClick={() => onFound(code)}>
                נמצאה
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy}>
        סיום העדכון ורישום החוסר
      </Button>
      <Button variant="quiet" size="md" onClick={onBack}>
        חזרה לסריקה
      </Button>
    </div>
  );
}
