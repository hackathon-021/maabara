'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { distributeSummary } from '../logic';

export function DistributeDone({ unit }: { unit: PackingUnitDTO }) {
  const router = useRouter();
  const summary = distributeSummary(unit);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      {summary.tone === 'warn' && <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>}

      <Button onClick={() => router.push('/field/distribute')}>פיזור אריזה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
