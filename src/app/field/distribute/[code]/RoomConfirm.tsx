'use client';

import { useState } from 'react';
import { Banner, Button, Card, TextField } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { destinationLine, roomWarning } from '../logic';

export function RoomConfirm({
  unit,
  atRoom,
  onChange,
  onConfirm,
  busy,
  error,
}: {
  unit: PackingUnitDTO;
  atRoom: string;
  onChange: (room: string) => void;
  onConfirm: (room: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [elsewhere, setElsewhere] = useState(false);
  const warning = roomWarning(unit, atRoom);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-3xl font-bold tabular-nums">{unit.code}</p>
        <p className="mt-1 font-bold">{destinationLine(unit)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {PACKING_UNIT_TYPE_LABELS[unit.type]} · {unit.items.length} פריטים · נארז ב{unit.sourceRoomName}
        </p>
      </Card>

      {!elsewhere ? (
        <Card className="flex flex-col gap-3">
          <p className="font-bold">באיזה חדר אתם נמצאים?</p>
          <Button
            onClick={() => {
              onChange(unit.destRoom ?? '');
              onConfirm(unit.destRoom ?? '');
            }}
            disabled={!unit.destRoom || busy}
            busy={busy}
          >
            אני ב{unit.destRoom ?? 'חדר היעד'}
          </Button>
          <Button variant="secondary" onClick={() => setElsewhere(true)} disabled={busy}>
            אני בחדר אחר
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <TextField label="החדר שאני נמצא בו" value={atRoom} onChange={onChange} autoFocus />
          {warning && <Banner tone="warn">{warning}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <Button onClick={() => onConfirm(atRoom)} disabled={atRoom.trim().length === 0 || busy} busy={busy}>
            המשך לפיזור
          </Button>
        </Card>
      )}
    </div>
  );
}
