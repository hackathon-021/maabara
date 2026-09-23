import { Card, EmptyState } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';

/** The mocked SMS outbox (spec §1: written to a table, never actually sent). */
export function SmsFeed({ notifications }: { notifications: DashboardDTO['notifications'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">הודעות שנשלחו</h2>
      {notifications.length === 0 ? (
        <EmptyState title="לא נשלחו עדיין הודעות" />
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => (
            <li key={n.id} className="border-b border-subtle pb-3 last:border-0">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {n.recipients} · {formatHeDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
