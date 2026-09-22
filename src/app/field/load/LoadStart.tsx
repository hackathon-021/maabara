'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, OptionList, Spinner, TextField, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { TRANSPORT_TYPES, type TransportType } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from '../format';
import { transportRequest } from './logic';

export function LoadStart({ initialGroupId }: { initialGroupId: number | null }) {
  const router = useRouter();
  const { busy, error, run } = useAction();

  const [type, setType] = useState<TransportType | null>(null);
  const [typeDetails, setTypeDetails] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [groupId, setGroupId] = useState<number | null>(initialGroupId);

  const groups = useSWR('groups', api.groups);
  // A truck left half-loaded on another phone, or before a refresh.
  const loading = useSWR('trucks-loading', () => api.transportUnits('loading'));

  const req = transportRequest({ type, typeDetails, licensePlate, groupId });

  function create() {
    if (!req) return;
    void run(
      () => api.createTransportUnit(req),
      (truck) => router.push(`/field/load/${truck.id}`),
    );
  }

  if (groups.error) return <Banner tone="danger">{describeError(groups.error).messageHe}</Banner>;
  if (!groups.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      {loading.data && loading.data.length > 0 && (
        <Card>
          <p className="mb-2 font-bold">יחידות הובלה בהעמסה</p>
          <OptionList
            options={loading.data.map((t) => ({
              value: t.id,
              label: `${TRANSPORT_TYPE_LABELS[t.type]} ${t.licensePlate}`,
              hint: `${t.boxes.length} אריזות · נפתחה ${formatHeDateTime(t.createdAt)}`,
            }))}
            value={null}
            onChange={(id) => router.push(`/field/load/${id}`)}
          />
        </Card>
      )}

      <Card>
        <p className="mb-2 font-bold">סוג יחידת הובלה</p>
        <OptionList
          options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_TYPE_LABELS[t] }))}
          value={type}
          onChange={setType}
        />
        {type === 'other' && (
          <div className="mt-3">
            <TextField label="פירוט" value={typeDetails} onChange={setTypeDetails} />
          </div>
        )}
      </Card>

      <Card>
        <TextField label="מספר רישוי" value={licensePlate} onChange={setLicensePlate} inputMode="numeric" />
      </Card>

      <Card>
        <p className="mb-2 font-bold">מדור</p>
        <OptionList
          options={groups.data.map((g) => ({ value: g.id, label: g.name }))}
          value={groupId}
          onChange={setGroupId}
        />
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={create} busy={busy} disabled={req === null}>
        פתיחת יחידת הובלה
      </Button>
    </div>
  );
}
