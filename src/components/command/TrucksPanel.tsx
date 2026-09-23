import { Card, EmptyState, StatusChip } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from './format';

export function TrucksPanel({ trucks }: { trucks: DashboardDTO['trucks'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">יחידות הובלה</h2>
      {trucks.length === 0 ? (
        <EmptyState title="אין עדיין יחידות הובלה" body="יחידת הובלה שתיפתח תופיע כאן." />
      ) : (
        <ul className="flex flex-col gap-2">
          {trucks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 border-b border-subtle pb-2 last:border-0">
              <span>
                {/* A column of plates and counts: tabular-nums keeps them aligned. */}
                <span className="block font-bold tabular-nums">{t.licensePlate}</span>
                <span className="block text-sm text-ink-muted">
                  {TRANSPORT_TYPE_LABELS[t.type]} · {t.boxCount} אריזות · יציאה{' '}
                  {formatHeDateTime(t.departedAt)}
                </span>
              </span>
              <StatusChip entityType="transport_unit" status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
