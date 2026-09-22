'use client';

import Link from 'next/link';
import { Card, EmptyState, Stepper } from '@/components/ui';
import { MAPPING_STATUS_LABELS } from '@/lib/labels';
import type { ItemRow } from '../logic';

export function ItemPicker({
  rows,
  draft,
  onChange,
}: {
  rows: ItemRow[];
  draft: Record<number, number>;
  onChange: (mappingReportId: number, quantity: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="אין פריטים לאריזה בחדר הזה"
        body="כל הפריטים שמסומנים כעוברים או כהנצלה כבר נארזו. אפשר לחזור ולבחור חדר אחר."
        action={
          <Link href="/field/pack" className="text-link">
            חזרה לבחירת חדר
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={row.mappingReportId}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.name}</p>
              <p className="text-sm text-ink-muted">
                {row.serial && `מק"ט ${row.serial} · `}
                {row.status ? MAPPING_STATUS_LABELS[row.status] : 'בתוך האריזה'}
              </p>
            </div>
            <Stepper
              label={row.name}
              value={draft[row.mappingReportId] ?? 0}
              max={row.max}
              onChange={(n) => onChange(row.mappingReportId, n)}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
