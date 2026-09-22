'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { ClosePackingUnitResult, PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import {
  canLeaveContents,
  draftToRequest,
  draftTotal,
  itemRows,
  needsItems,
  normalizeDestination,
} from '../logic';
import { DestinationForm } from './DestinationForm';
import { ItemPicker } from './ItemPicker';
import { PackDone } from './PackDone';

/**
 * The open box survives a refresh in sessionStorage — there is no GET /api/packing-units/:id
 * and an open box has no code to look it up by.
 * // TODO: drop this once a read-by-id route exists.
 */
const key = (unitId: number) => `pack:${unitId}`;

function readCachedUnit(unitId: number): PackingUnitDTO | null {
  try {
    const raw = sessionStorage.getItem(key(unitId));
    return raw ? (JSON.parse(raw) as PackingUnitDTO) : null;
  } catch {
    return null;
  }
}

export function cacheUnit(unit: PackingUnitDTO): void {
  try {
    sessionStorage.setItem(key(unit.id), JSON.stringify(unit));
  } catch {
    // Private mode or a full quota: the packer just cannot refresh. Not worth failing for.
  }
}

type Step = 'contents' | 'destination' | 'done';

export function PackUnit({ unitId }: { unitId: number }) {
  const [unit, setUnit] = useState<PackingUnitDTO | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [dest, setDest] = useState({ destBuilding: '', destFloor: '', destRoom: '' });
  const [result, setResult] = useState<ClosePackingUnitResult | null>(null);
  const [step, setStep] = useState<Step>('contents');
  const { busy, error, run } = useAction();

  useEffect(() => {
    const cached = readCachedUnit(unitId);
    setUnit(cached);
    // A personal carton has no contents step at all (spec §5.1).
    if (cached && !needsItems(cached.type)) setStep('destination');
  }, [unitId]);

  // Fetched once per box, then explicitly revalidated only right after a save (see
  // saveAndContinue's onOk) — never automatically on focus/reconnect/mount. The key is scoped
  // to the box (not just the room) so packing a second box from the same room in one session
  // never serves the first box's cached snapshot. See Conventions #2.
  const packable = useSWR(
    unit && needsItems(unit.type) ? ['packable', unit.id, unit.sourceRoomId] : null,
    () => api.packableItems((unit as PackingUnitDTO).sourceRoomId),
    { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false },
  );

  const rows = useMemo(() => itemRows(packable.data ?? [], unit?.items ?? []), [packable.data, unit]);

  useEffect(() => {
    if (rows.length === 0) return;
    setDraft(Object.fromEntries(rows.map((r) => [r.mappingReportId, r.initial])));
  }, [rows]);

  function saveAndContinue() {
    void run(
      () => api.setPackingUnitItems(unitId, draftToRequest(draft)),
      (updated) => {
        setUnit(updated);
        cacheUnit(updated);
        void packable.mutate();
        setStep('destination');
      },
    );
  }

  function close() {
    const req = normalizeDestination(dest);
    if (!req) return;
    void run(
      () => api.closePackingUnit(unitId, req),
      (closed) => {
        setResult(closed);
        setStep('done');
        try {
          sessionStorage.removeItem(key(unitId));
        } catch {
          // Nothing to clean up. The box is closed either way.
        }
      },
    );
  }

  if (!unit) return <MissingUnitCard />;
  if (step === 'done' && result) return <PackDone result={result} />;

  if (step === 'destination') {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <p className="font-bold">{unit.sourceRoomName}</p>
          <p className="text-sm text-ink-muted">
            {PACKING_UNIT_TYPE_LABELS[unit.type]}
            {needsItems(unit.type) && ` · ${draftTotal(draft)} פריטים`}
          </p>
        </Card>
        {needsItems(unit.type) && (
          <Button variant="quiet" size="md" onClick={() => setStep('contents')}>
            חזרה לבחירת פריטים
          </Button>
        )}
        <DestinationForm value={dest} onChange={setDest} onSubmit={close} busy={busy} error={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">{unit.sourceRoomName}</p>
        <p className="text-sm text-ink-muted">{PACKING_UNIT_TYPE_LABELS[unit.type]}</p>
      </Card>

      {packable.error ? (
        <Banner tone="danger" title="לא ניתן לטעון את הפריטים">
          {describeError(packable.error).messageHe}
        </Banner>
      ) : !packable.data ? (
        <Spinner />
      ) : (
        <ItemPicker
          rows={rows}
          draft={draft}
          onChange={(mappingReportId, quantity) => setDraft((d) => ({ ...d, [mappingReportId]: quantity }))}
        />
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <p className="mb-2 text-center text-sm text-ink-muted">בתוך האריזה: {draftTotal(draft)} פריטים</p>
        <Button onClick={saveAndContinue} busy={busy} disabled={!canLeaveContents(unit.type, draft)}>
          המשך להזנת יעד
        </Button>
      </div>
    </div>
  );
}

export function MissingUnitCard() {
  return (
    <Card className="text-center">
      <p className="font-bold">האריזה לא נמצאה במכשיר הזה</p>
      <p className="mt-1 text-sm text-ink-muted">יש לפתוח אריזה חדשה ולהמשיך משם.</p>
      <Link href="/field/pack" className="mt-4 inline-block text-link">
        חזרה לבחירת חדר
      </Link>
    </Card>
  );
}
