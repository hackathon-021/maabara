'use client';

import useSWR from 'swr';
import { Banner, describeError, Dialog, EmptyState, Spinner, StatusChip } from '@/components/ui';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';

/** The drill-down: every box packed out of one room (spec §6). */
export function RoomBoxes({
  roomId,
  roomName,
  onClose,
}: {
  roomId: number;
  roomName: string;
  onClose: () => void;
}) {
  const boxes = useSWR(['room-boxes', roomId], () => api.packingUnits({ roomId }));

  return (
    <Dialog open title={`אריזות מ${roomName}`} onClose={onClose}>
      {boxes.error ? (
        <Banner tone="danger">{describeError(boxes.error).messageHe}</Banner>
      ) : !boxes.data ? (
        <Spinner />
      ) : boxes.data.length === 0 ? (
        <EmptyState title="עדיין לא נארזו אריזות מהחדר הזה" />
      ) : (
        <ul className="flex flex-col gap-2">
          {boxes.data.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-card border border-subtle p-3"
            >
              <span>
                {/* A column of codes: tabular-nums so the digits line up. */}
                <span className="block font-bold tabular-nums">{b.code ?? '—'}</span>
                <span className="block text-sm text-ink-muted">
                  {PACKING_UNIT_TYPE_LABELS[b.type]} · יעד {b.destRoom ?? '—'}
                </span>
              </span>
              <StatusChip entityType="packing_unit" status={b.status} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
