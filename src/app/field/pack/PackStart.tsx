'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, OptionList, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPES, type PackingUnitType } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { isRoomPackable, roomHintHe } from './logic';
import { cacheUnit } from './[unitId]/PackUnit';

export function PackStart({ initialRoomId }: { initialRoomId: number | null }) {
  const router = useRouter();
  const { busy, error, setError, run } = useAction();

  const [groupId, setGroupId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(initialRoomId);
  const [type, setType] = useState<PackingUnitType | null>(null);

  const groups = useSWR('groups', api.groups);
  const rooms = useSWR(groupId ? ['rooms', groupId] : null, () => api.rooms(groupId as number));

  // Arriving with ?roomId= (from "pack another box"): find its group so the room list loads.
  useEffect(() => {
    if (initialRoomId === null || groupId !== null || !groups.data) return;
    const allGroups = groups.data;
    void (async () => {
      for (const g of allGroups) {
        const list = await api.rooms(g.id);
        if (list.some((r) => r.id === initialRoomId)) {
          setGroupId(g.id);
          return;
        }
      }
    })();
  }, [initialRoomId, groupId, groups.data]);

  const room = rooms.data?.find((r) => r.id === roomId) ?? null;
  const roomBlocked = room !== null && !isRoomPackable(room.status);

  function open() {
    if (roomId === null || type === null) return;
    void run(
      () => api.openPackingUnit({ sourceRoomId: roomId, type }),
      (unit) => {
        cacheUnit(unit);
        router.push(`/field/pack/${unit.id}`);
      },
    );
  }

  if (groups.error) return <Banner tone="danger">{describeError(groups.error).messageHe}</Banner>;
  if (!groups.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-2 font-bold">מדור</p>
        <OptionList
          options={groups.data.map((g) => ({ value: g.id, label: g.name }))}
          value={groupId}
          onChange={(id) => {
            setGroupId(id);
            setRoomId(null);
            setError(null);
          }}
        />
      </Card>

      {groupId !== null && (
        <Card>
          <p className="mb-2 font-bold">חדר</p>
          {rooms.error ? (
            <Banner tone="danger">{describeError(rooms.error).messageHe}</Banner>
          ) : !rooms.data ? (
            <Spinner />
          ) : (
            <OptionList
              options={rooms.data.map((r) => ({
                value: r.id,
                label: r.description,
                hint: roomHintHe(r),
                disabled: !isRoomPackable(r.status),
              }))}
              value={roomId}
              onChange={(id) => {
                setRoomId(id);
                setError(null);
              }}
            />
          )}
        </Card>
      )}

      {roomBlocked && <Banner tone="warn" title="לא ניתן לארוז מחדר זה">{roomHintHe(room)}</Banner>}

      {roomId !== null && !roomBlocked && (
        <Card>
          <p className="mb-2 font-bold">סוג יחידת אריזה</p>
          <OptionList
            options={PACKING_UNIT_TYPES.map((t) => ({ value: t, label: PACKING_UNIT_TYPE_LABELS[t] }))}
            value={type}
            onChange={setType}
          />
        </Card>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={open} busy={busy} disabled={roomId === null || roomBlocked || type === null}>
        פתיחת אריזה
      </Button>
    </div>
  );
}
