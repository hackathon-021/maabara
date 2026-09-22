import type { EntityType } from '@/lib/contracts';
import type { Tx } from '@/lib/db';

/** Mocked distribution list — spec §1: SMS is written to a table, never really sent. */
export const DEFAULT_RECIPIENTS = 'רשימת תפוצה — מבצע המעבר דרומה';

export interface EventInput {
  entityType: EntityType;
  entityId: number;
  /** null means the row is being created. */
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  note?: string;
}

export interface NotifyInput {
  body: string;
  entityType: EntityType;
  entityId: number;
}

/** Appends one audit row. Always called with the same `tx` as the update it describes. */
export function recordEvent(tx: Tx, e: EventInput) {
  return tx.statusEvent.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorId: e.actorId,
      note: e.note ?? null,
    },
  });
}

/** Queues a mocked SMS; the commander dashboard reads these as a feed. */
export function notify(tx: Tx, n: NotifyInput) {
  return tx.notification.create({
    data: {
      channel: 'sms',
      recipients: DEFAULT_RECIPIENTS,
      body: n.body,
      entityType: n.entityType,
      entityId: n.entityId,
    },
  });
}

/** Israel-local date and time, for SMS bodies. */
export function formatHe(at: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}
