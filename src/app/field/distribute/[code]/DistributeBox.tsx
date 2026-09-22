'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO } from '@/lib/contracts';
import {
  distributeRequest,
  distributeVerdict,
  emptyDraft,
  fullDraft,
  needsItemStep,
  shortfall,
} from '../logic';
import { DistributeDone } from './DistributeDone';
import { DistributeRecheck } from './DistributeRecheck';
import { ItemHandover } from './ItemHandover';
import { RoomConfirm } from './RoomConfirm';

type Step = 'room' | 'items' | 'recheck' | 'done';

export function DistributeBox({ code }: { code: string }) {
  const [atRoom, setAtRoom] = useState('');
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [step, setStep] = useState<Step>('room');
  const [result, setResult] = useState<PackingUnitDTO | null>(null);
  const { busy, error, run } = useAction();

  const box = useSWR(['box', code], () => api.packingUnitByCode(code).catch(() => null));
  const unit = box.data ?? null;

  useEffect(() => {
    if (unit) setDraft(emptyDraft(unit.items));
  }, [unit]);

  function submit(id: number) {
    void run(
      () => api.distributePackingUnit(id, distributeRequest(draft, atRoom)),
      (distributed) => {
        setResult(distributed);
        setStep('done');
      },
    );
  }

  if (box.error) return <Banner tone="danger">{describeError(box.error).messageHe}</Banner>;
  if (box.data === undefined) return <Spinner />;
  if (step === 'done' && result) return <DistributeDone unit={result} />;

  const verdict = distributeVerdict(code, unit);
  if (verdict.kind === 'reject') {
    return (
      <Card className="text-center">
        <p className="font-bold">{verdict.messageHe}</p>
        <Link href="/field/distribute" className="mt-4 inline-block text-link">
          חזרה לבחירת אריזה
        </Link>
      </Card>
    );
  }

  const open = verdict.unit;
  const short = shortfall(open.items, draft);

  if (step === 'room') {
    return (
      <RoomConfirm
        unit={open}
        atRoom={atRoom}
        onChange={setAtRoom}
        // A personal carton has nothing to tick — straight to the write (flow note Fn).
        onConfirm={() => (needsItemStep(open) ? setStep('items') : submit(open.id))}
      />
    );
  }

  if (step === 'recheck') {
    return (
      <DistributeRecheck
        short={short}
        onSubmit={() => submit(open.id)}
        onBack={() => setStep('items')}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold tabular-nums">{open.code}</p>
        <p className="text-sm text-ink-muted">מפזרים ב{atRoom}</p>
      </Card>

      <ItemHandover
        items={open.items}
        draft={draft}
        onChange={(itemId, quantity) => setDraft((d) => ({ ...d, [itemId]: quantity }))}
        onAll={() => setDraft(fullDraft(open.items))}
      />

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <Button busy={busy} onClick={() => (short.length > 0 ? setStep('recheck') : submit(open.id))}>
          {short.length > 0 ? `סיום פיזור (${short.length} בחוסר)` : 'סיום פיזור הפריטים'}
        </Button>
      </div>
    </div>
  );
}
