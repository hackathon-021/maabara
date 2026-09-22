'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { ReceiveResult } from '@/lib/contracts';
import { receiveSummary } from '../logic';

export function ReceiveDone({ result }: { result: ReceiveResult }) {
  const router = useRouter();
  const summary = receiveSummary(result);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>

      <Button onClick={() => router.push('/field/receive')}>קבלת יחידת הובלה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
