'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Banner, Card, describeError, EmptyState, OptionList, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from '../format';

export function ReceiveStart() {
  const router = useRouter();
  const trucks = useSWR('trucks-in-transit', () => api.transportUnits('in_transit'));

  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (trucks.data.length === 0) {
    return <EmptyState title="אין כרגע יחידות הובלה בדרך" body="ברגע שיחידת הובלה תצא לדרך היא תופיע כאן." />;
  }

  return (
    <Card>
      <p className="mb-2 font-bold">יחידות הובלה בדרך</p>
      <OptionList
        options={trucks.data.map((t) => ({
          value: t.id,
          label: `${TRANSPORT_TYPE_LABELS[t.type]} ${t.licensePlate}`,
          hint: `${t.boxes.length} אריזות · יציאה ${formatHeDateTime(t.departedAt)}`,
        }))}
        value={null}
        onChange={(id) => router.push(`/field/receive/${id}`)}
      />
    </Card>
  );
}
