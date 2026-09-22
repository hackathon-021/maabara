'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Button, Card } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { labelLines } from '@/app/field/pack/logic';

/**
 * The box label: a QR of the bare 5-digit code plus the code in large type.
 * The payload is the code and nothing else — P4's scanner and
 * GET /api/packing-units/by-code/:code both read it literally.
 */
export function QrLabel({ unit }: { unit: PackingUnitDTO }) {
  if (!unit.code) return null;
  return (
    <>
      <Card className="print-label text-center">
        <QRCodeSVG value={unit.code} size={200} className="mx-auto" />
        <p className="mt-3 text-4xl font-bold tabular-nums tracking-widest">{unit.code}</p>
        <dl className="mt-4 flex flex-col gap-1 text-right text-sm">
          {labelLines(unit).map((line) => (
            <div key={line.label} className="flex justify-between gap-2">
              <dt className="text-ink-muted">{line.label}</dt>
              <dd className="font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Button variant="secondary" className="print-hide" onClick={() => window.print()}>
        הדפסת מדבקה
      </Button>
    </>
  );
}
