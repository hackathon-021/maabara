'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Card, describeError, EmptyState, OptionList, Spinner } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { normalizeCode } from '@/lib/scan-session';

export function DistributeStart() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const boxes = useSWR('boxes-received', () => api.packingUnits({ status: 'received' }));

  function open(raw: string) {
    const code = normalizeCode(raw);
    if (!code) {
      setNote('יש להזין מספר אריזה בן 5 ספרות');
      feedback('error');
      return;
    }
    // The box page does the lookup and reports anything wrong with it.
    router.push(`/field/distribute/${code}`);
  }

  if (boxes.error) return <Banner tone="danger">{describeError(boxes.error).messageHe}</Banner>;

  return (
    <div className="flex flex-col gap-4">
      <ScanOrType onCode={open} hint="סרקו את מדבקת האריזה או הקלידו את מספרה" />
      {note && <Banner tone="danger">{note}</Banner>}

      {!boxes.data ? (
        <Spinner />
      ) : boxes.data.length === 0 ? (
        <EmptyState title="אין כרגע אריזות שהתקבלו" body="אריזות שיתקבלו ביחידת הובלה יופיעו כאן לפיזור." />
      ) : (
        <Card>
          <p className="mb-2 font-bold">אריזות שהתקבלו</p>
          <OptionList
            options={boxes.data
              .filter((b) => b.code !== null)
              .map((b) => ({
                value: b.code as string,
                label: b.code as string,
                hint: `${PACKING_UNIT_TYPE_LABELS[b.type]} · ${b.destRoom ?? '—'}`,
              }))}
            value={null}
            onChange={open}
          />
        </Card>
      )}
    </div>
  );
}
