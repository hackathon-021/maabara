import { Card, EmptyState } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';
import { exceptionBadge } from './logic';

const TONE: Record<'danger' | 'warn', string> = {
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
};

export function ExceptionsPanel({ exceptions }: { exceptions: DashboardDTO['exceptions'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">חריגים</h2>
      {exceptions.length === 0 ? (
        <EmptyState title="אין חריגים" body="כל הציוד שנארז הגיע ופוזר." />
      ) : (
        <ul className="flex flex-col gap-3">
          {exceptions.map((e, index) => {
            const badge = exceptionBadge(e.kind);
            return (
              <li key={`${e.kind}-${e.packingUnitId}-${index}`} className="border-b border-subtle pb-3 last:border-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${TONE[badge.tone]}`}>
                  <span aria-hidden>{badge.glyph}</span>
                  {badge.label}
                </span>
                <p className="mt-1 font-medium">{e.description}</p>
                <p className="text-sm text-ink-muted">
                  {e.lastActorName} · {formatHeDateTime(e.at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
