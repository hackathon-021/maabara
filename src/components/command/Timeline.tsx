import { EmptyState } from '@/components/ui';
import type { TimelineEventDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';

export function Timeline({ events }: { events: TimelineEventDTO[] }) {
  if (events.length === 0) {
    return <EmptyState title="אין עדיין אירועים לאריזה הזו" />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 border-b border-subtle pb-3 last:border-0">
          {/* A column of times: tabular-nums so they line up down the page. */}
          <span className="shrink-0 pt-0.5 text-sm text-ink-muted tabular-nums">
            {formatHeDateTime(e.at)}
          </span>
          <span>
            <span className="block font-medium">{e.label}</span>
            <span className="block text-sm text-ink-muted">
              {e.actorName}
              {e.note && ` · ${e.note}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
