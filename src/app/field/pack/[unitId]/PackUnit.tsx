'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { canLeaveContents, draftToRequest, draftTotal, itemRows, needsItems } from '../logic';
import { ItemPicker } from './ItemPicker';

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

export function PackUnit({ unitId }: { unitId: number }) {
  const [unit, setUnit] = useState<PackingUnitDTO | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const { busy, error, run } = useAction();

  useEffect(() => {
    setUnit(readCachedUnit(unitId));
  }, [unitId]);

  // Loaded once per box and never re-fetched — see Conventions #2.
  const packable = useSWR(unit ? ['packable', unit.sourceRoomId] : null, () =>
    api.packableItems((unit as PackingUnitDTO).sourceRoomId),
  );

  const rows = useMemo(() => itemRows(packable.data ?? [], unit?.items ?? []), [packable.data, unit]);

  useEffect(() => {
    if (rows.length === 0) return;
    setDraft(Object.fromEntries(rows.map((r) => [r.mappingReportId, r.initial])));
  }, [rows]);

  if (!unit) return <MissingUnitCard />;

  if (!needsItems(unit.type)) {
    // Personal carton: no contents at all (spec §5.1). Task 8 renders the destination step here.
    return <PersonalCartonNotice unit={unit} />;
  }

  function saveAndContinue() {
    void run(
      () => api.setPackingUnitItems(unitId, draftToRequest(draft)),
      (updated) => {
        setUnit(updated);
        cacheUnit(updated);
        // Task 8 replaces this with a move to the destination step.
      },
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

function PersonalCartonNotice({ unit }: { unit: PackingUnitDTO }) {
  return (
    <Card>
      <p className="font-bold">{PACKING_UNIT_TYPE_LABELS[unit.type]}</p>
      <p className="mt-1 text-sm text-ink-muted">בקרטון אישי לא מסמנים פריטים — ממשיכים ישר להזנת היעד.</p>
    </Card>
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
