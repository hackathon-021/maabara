'use client';

import { Card, EmptyState, StatusChip } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { progressPercent, roomsByGroup } from './logic';
import { Meter } from './Meter';

export function RoomsGrid({
  rooms,
  onOpen,
}: {
  rooms: DashboardDTO['rooms'];
  onOpen: (room: DashboardDTO['rooms'][number]) => void;
}) {
  if (rooms.length === 0) {
    return <EmptyState title="אין עדיין חדרים במערכת" body="חדרים שמופו בשלב א׳ יופיעו כאן." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {roomsByGroup(rooms).map((group) => (
        <section key={group.groupName}>
          <h2 className="mb-2 font-bold text-white">{group.groupName}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.rooms.map((room) => (
              <button key={room.id} type="button" onClick={() => onOpen(room)} className="text-right">
                <Card className="h-full transition hover:border-primary">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">{room.description}</p>
                    <StatusChip entityType="room" status={room.status} />
                  </div>
                  <p className="mt-2 mb-2 text-sm text-ink-muted">
                    נארזו {room.packedQty} מתוך {room.mappedQty} פריטים ·{' '}
                    {progressPercent(room.packedQty, room.mappedQty)}%
                  </p>
                  <Meter
                    value={room.packedQty}
                    max={room.mappedQty}
                    label={`התקדמות אריזה ב${room.description}`}
                  />
                </Card>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
