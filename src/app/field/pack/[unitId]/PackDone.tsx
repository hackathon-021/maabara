'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button, Card } from '@/components/ui';
import type { ClosePackingUnitResult } from '@/lib/contracts';
import { completionSummary } from '../logic';

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

      {/* Task 9 renders <QrLabel unit={result.unit} /> here. */}

      {summary.canPackMore ? (
        <>
          <Button onClick={() => router.push(`/field/pack?roomId=${result.unit.sourceRoomId}`)}>
            אריזה נוספת בחדר זה
          </Button>
          {/* flows/packing_flow.md node U: two ways to stop, and they mean different things to the room. */}
          <Button variant="secondary" onClick={() => router.push('/field/pack')}>
            לא נותרו פריטים לאריזה
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
