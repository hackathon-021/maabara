'use client';

import { Button, Card, Stepper } from '@/components/ui';
import type { PackingUnitItemDTO } from '@/lib/contracts';
import { maxFor } from '../logic';

export function ItemHandover({
  items,
  draft,
  onChange,
  onAll,
}: {
  items: PackingUnitItemDTO[];
  draft: Record<number, number>;
  onChange: (itemId: number, quantity: number) => void;
  onAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={onAll}>
        פוזר הכל
      </Button>
      {items.map((i) => (
        <Card key={i.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{i.name}</p>
              <p className="text-sm text-ink-muted">
                {i.serial && `מק"ט ${i.serial} · `}
                {maxFor(i)} באריזה
              </p>
            </div>
            <Stepper
              label={i.name}
              value={draft[i.id] ?? 0}
              max={maxFor(i)}
              onChange={(n) => onChange(i.id, n)}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
