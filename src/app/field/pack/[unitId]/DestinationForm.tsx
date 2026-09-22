'use client';

import { Banner, Button, Card, TextField } from '@/components/ui';
import { normalizeDestination } from '../logic';

export function DestinationForm({
  value,
  onChange,
  onSubmit,
  busy,
  error,
}: {
  value: { destBuilding: string; destFloor: string; destRoom: string };
  onChange: (next: { destBuilding: string; destFloor: string; destRoom: string }) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const ready = normalizeDestination(value) !== null;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="font-bold">לאן האריזה מגיעה?</p>
        <TextField label="בניין" value={value.destBuilding} onChange={(v) => onChange({ ...value, destBuilding: v })} autoFocus />
        <TextField label="קומה" value={value.destFloor} onChange={(v) => onChange({ ...value, destFloor: v })} />
        <TextField label="חדר" value={value.destRoom} onChange={(v) => onChange({ ...value, destRoom: v })} />
        {!ready && <p className="text-sm text-ink-muted">יש למלא בניין, קומה וחדר</p>}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy} disabled={!ready}>
        סיום אריזה
      </Button>
    </div>
  );
}
