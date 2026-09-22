'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import type { TransportUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS, TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { addCode, removeCode } from '@/lib/scan-session';
import { classifyLoadScan } from '../logic';
import { LoadDone } from './LoadDone';

export function LoadTruck({ truckId }: { truckId: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [done, setDone] = useState<TransportUnitDTO | null>(null);
  const { busy, error, run } = useAction();

  const trucks = useSWR('trucks-loading', () => api.transportUnits('loading'));
  const available = useSWR('boxes-closed', () => api.packingUnits({ status: 'closed' }));

  const truck = trucks.data?.find((t) => t.id === truckId) ?? null;

  function scan(raw: string) {
    const scanned = classifyLoadScan(raw, available.data ?? [], picked);
    if (scanned.kind === 'accepted') {
      setPicked((prev) => addCode(prev, scanned.code).codes);
      setNote({ tone: 'ok', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'duplicate') {
      // A re-scan is a friendly no-op, not a failure (spec §5.5).
      setNote({ tone: 'warn', text: scanned.messageHe });
      feedback('success');
      return;
    }
    setNote({ tone: 'danger', text: scanned.messageHe });
    feedback('error');
  }

  function finish() {
    void run(
      () => api.loadTransportUnit(truckId, { codes: picked }),
      (loaded) => setDone(loaded),
    );
  }

  if (done) return <LoadDone truck={done} />;
  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (!truck) {
    return (
      <Card className="text-center">
        <p className="font-bold">יחידת ההובלה אינה בהעמסה</p>
        <p className="mt-1 text-sm text-ink-muted">ייתכן שכבר יצאה לדרך.</p>
        <Link href="/field/load" className="mt-4 inline-block text-link">
          חזרה ליחידות ההובלה
        </Link>
      </Card>
    );
  }

  const availableBoxes = available.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">
          {TRANSPORT_TYPE_LABELS[truck.type]} {truck.licensePlate}
        </p>
        <p className="text-sm text-ink-muted">{truck.typeDetails ?? 'סריקת האריזות להעמסה'}</p>
      </Card>

      <ScanOrType onCode={scan} hint="סרקו את מדבקת האריזה או הקלידו את מספרה" />
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <Card>
        <p className="mb-2 font-bold">אריזות סגורות</p>
        {available.error ? (
          <Banner tone="danger">{describeError(available.error).messageHe}</Banner>
        ) : !available.data ? (
          <Spinner />
        ) : availableBoxes.length === 0 ? (
          <p className="text-sm text-ink-muted">אין כרגע אריזות סגורות הממתינות להעמסה.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {availableBoxes.map((b) => {
              const code = b.code;
              if (code === null) return null;
              const on = picked.includes(code);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => (on ? setPicked((p) => removeCode(p, code)) : scan(code))}
                    aria-pressed={on}
                    className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-card border-2 px-4 text-right ${
                      on ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
                    }`}
                  >
                    <span>
                      <span className="block font-bold tabular-nums">{code}</span>
                      <span className="block text-sm text-ink-muted">
                        {PACKING_UNIT_TYPE_LABELS[b.type]} · {b.sourceRoomName}
                      </span>
                    </span>
                    <span aria-hidden className="text-2xl text-primary">
                      {on ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <p className="mb-2 text-center text-sm text-ink-muted">בהעמסה: {picked.length} אריזות</p>
        <Button onClick={finish} busy={busy} disabled={picked.length === 0}>
          סיום העמסה
        </Button>
      </div>
    </div>
  );
}
