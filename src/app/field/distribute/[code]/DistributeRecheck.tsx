'use client';

import { Banner, Button, Card } from '@/components/ui';
import type { PackingUnitItemDTO } from '@/lib/contracts';

/**
 * flows/distributing_flow.md nodes J–L: the shortfall is shown, item by item,
 * before anything is written — and the distributor can go back and look again.
 */
export function DistributeRecheck({
  short,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  short: { item: PackingUnitItemDTO; missing: number }[];
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warn" title="שים לב, לא כל הפריטים פוזרו">
        הפריטים הבאים יירשמו בחוסר. כדאי לבדוק שוב בתוך האריזה לפני סיום.
      </Banner>

      <Card>
        <ul className="flex flex-col gap-2">
          {short.map(({ item, missing }) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-subtle py-2 last:border-0">
              <span className="font-bold">{item.name}</span>
              <span className="text-sm text-warn">חסרים {missing}</span>
            </li>
          ))}
        </ul>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy}>
        סיום העדכון ורישום החוסר
      </Button>
      <Button variant="quiet" size="md" onClick={onBack}>
        חזרה לסימון הפריטים
      </Button>
    </div>
  );
}
