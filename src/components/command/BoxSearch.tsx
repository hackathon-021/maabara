'use client';

import { useState } from 'react';
import { Banner, Button, Card, describeError, Dialog, Spinner, StatusChip, TextField } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO, TimelineEventDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { parseSearchCode } from './logic';
import { Timeline } from './Timeline';

export function BoxSearch() {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ unit: PackingUnitDTO; events: TimelineEventDTO[] } | null>(null);

  async function search() {
    const code = parseSearchCode(typed);
    if (!code) {
      setError('יש להזין מספר אריזה בן 5 ספרות');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const unit = await api.packingUnitByCode(code);
      const events = await api.timeline(unit.id);
      setFound({ unit, events });
    } catch (e) {
      // A code that was never issued answers 404 NOT_FOUND with a Hebrew message.
      setError(describeError(e).messageHe);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-bold">חיפוש אריזה</h2>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextField
            label="מספר אריזה"
            value={typed}
            onChange={(v) => {
              setTyped(v);
              setError(null);
            }}
            inputMode="numeric"
            maxLength={5}
          />
        </div>
        {/* The kit's Button is full-width by design, so the width lives on a wrapper. */}
        <div className="w-40">
          <Button size="md" onClick={() => void search()} busy={busy}>
            חיפוש
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      {found && (
        <Dialog open title={`אריזה ${found.unit.code ?? '—'}`} onClose={() => setFound(null)}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <StatusChip entityType="packing_unit" status={found.unit.status} />
            <span>{PACKING_UNIT_TYPE_LABELS[found.unit.type]}</span>
            <span>· נארז ב{found.unit.sourceRoomName}</span>
            <span>· יעד {found.unit.destRoom ?? '—'}</span>
            <span>· {found.unit.packedByName}</span>
          </div>
          {busy ? <Spinner /> : <Timeline events={found.events} />}
        </Dialog>
      )}
    </Card>
  );
}
