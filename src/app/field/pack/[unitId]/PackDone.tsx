'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button, Card } from '@/components/ui';
import type { ClosePackingUnitResult } from '@/lib/contracts';
import { completionSummary } from '../logic';
import { QrLabel } from '@/components/QrLabel';

export function PackDone({ result }: { result: ClosePackingUnitResult }) {
  const router = useRouter();
  const summary = completionSummary(result);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>

      <QrLabel unit={result.unit} />

      {summary.canPackMore ? (
        <>
          <Button onClick={() => router.push(`/field/pack?roomId=${result.unit.sourceRoomId}`)}>
            אריזה נוספת בחדר זה
          </Button>
          {/* TODO: no API exists yet for "packer declares the room finished" while items remain —
              both buttons below are pure navigation today. Needs a P1/P2 contract addition
              (flows/packing_flow.md node U) before this distinction can be real. */}
          <Button variant="secondary" onClick={() => router.push('/field')}>
            אין יותר פריטים לאריזה
          </Button>
          <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
            הפסקה זמנית באריזה
          </Button>
        </>
      ) : (
        <>
          <Card className="text-center text-sm text-ink-muted">אין עוד מה לארוז בחדר הזה.</Card>
          <Button onClick={() => router.push('/field/pack')}>מעבר לחדר אחר</Button>
          <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
            חזרה למסך הראשי
          </Button>
        </>
      )}
    </div>
  );
}
