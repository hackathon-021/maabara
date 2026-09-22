'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Dialog, Spinner } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS, TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { addCode } from '@/lib/scan-session';
import { classifyReceiveScan, expectedCodes, surplusVerdict, unconfirmedCodes } from '../logic';

export function ReceiveTruck({ truckId }: { truckId: number }) {
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [surplus, setSurplus] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [ask, setAsk] = useState<{ code: string; messageHe: string } | null>(null);

  const trucks = useSWR('trucks-in-transit', () => api.transportUnits('in_transit'));
  const truck = trucks.data?.find((t) => t.id === truckId) ?? null;
  const expected = truck ? expectedCodes(truck) : [];

  async function scan(raw: string) {
    const scanned = classifyReceiveScan(raw, expected, confirmed, surplus);

    if (scanned.kind === 'confirmed') {
      setConfirmed((prev) => addCode(prev, scanned.code).codes);
      setNote({ tone: 'ok', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'duplicate') {
      setNote({ tone: 'warn', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'invalid') {
      setNote({ tone: 'danger', text: scanned.messageHe });
      feedback('error');
      return;
    }

    // Not on this truck: ask the server what it is before offering anything.
    const unit = await api.packingUnitByCode(scanned.code).catch(() => null);
    const verdict = surplusVerdict(scanned.code, unit);
    if (verdict.kind === 'reject') {
      setNote({ tone: 'danger', text: verdict.messageHe });
      feedback('error');
      return;
    }
    feedback('error');
    setAsk({ code: scanned.code, messageHe: verdict.messageHe });
  }

  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (!truck) {
    return (
      <Card className="text-center">
        <p className="font-bold">יחידת ההובלה אינה בדרך</p>
        <p className="mt-1 text-sm text-ink-muted">ייתכן שכבר נפרקה ושוחררה.</p>
        <Link href="/field/receive" className="mt-4 inline-block text-link">
          חזרה ליחידות ההובלה
        </Link>
      </Card>
    );
  }

  const missing = unconfirmedCodes(expected, confirmed);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">
          {TRANSPORT_TYPE_LABELS[truck.type]} {truck.licensePlate}
        </p>
        <p className="text-sm text-ink-muted">סרקו כל אריזה שיורדת מיחידת ההובלה</p>
      </Card>

      <ScanOrType onCode={(code) => void scan(code)} />
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <Card>
        <p className="mb-2 font-bold">אריזות על יחידת ההובלה</p>
        <ul className="flex flex-col gap-2">
          {truck.boxes.map((b) => {
            const on = b.code !== null && confirmed.includes(b.code);
            return (
              <li
                key={b.id}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-card border-2 px-4 ${
                  on ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
                }`}
              >
                <span>
                  <span className="block font-bold tabular-nums">{b.code}</span>
                  <span className="block text-sm text-ink-muted">
                    {PACKING_UNIT_TYPE_LABELS[b.type]} · {b.sourceRoomName}
                  </span>
                </span>
                <span aria-hidden className="text-2xl text-primary">
                  {on ? '✓' : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {surplus.length > 0 && (
          <p className="mt-3 text-sm text-warn">התקבלו בעודף: {surplus.join(', ')}</p>
        )}
      </Card>

      <Dialog open={ask !== null} title="אריזה בעודף" onClose={() => setAsk(null)}>
        <p className="mb-4">{ask?.messageHe}</p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              if (!ask) return;
              setSurplus((prev) => addCode(prev, ask.code).codes);
              setNote({ tone: 'warn', text: `אריזה ${ask.code} התקבלה כעודף` });
              feedback('success');
              setAsk(null);
            }}
          >
            כן, לקבל כעודף
          </Button>
          <Button variant="secondary" onClick={() => setAsk(null)}>
            לא
          </Button>
        </div>
      </Dialog>

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        {/* spec §5.3.2: the live counter is what the unloader actually watches. */}
        <p className="mb-2 text-center text-lg font-bold tabular-nums">
          {confirmed.length}/{expected.length}
        </p>
        <Button disabled>{missing.length > 0 ? `סיום פריקה (${missing.length} חסרות)` : 'סיום פריקה'}</Button>
      </div>
    </div>
  );
}
