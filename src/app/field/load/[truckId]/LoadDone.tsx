'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { TransportUnitDTO } from '@/lib/contracts';
import { loadSummary } from '../logic';

export function LoadDone({ truck }: { truck: TransportUnitDTO }) {
  const router = useRouter();
  const summary = loadSummary(truck);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone="ok" title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>

      {/* flows/transporting_flow.md node AH: another load is a new transport unit under the same group. */}
      <Button onClick={() => router.push(`/field/load?groupId=${truck.groupId}`)}>העמסה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
