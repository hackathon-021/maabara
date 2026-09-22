'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Card, describeError, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { distributeVerdict } from '../logic';
import { RoomConfirm } from './RoomConfirm';

export function DistributeBox({ code }: { code: string }) {
  const [atRoom, setAtRoom] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const box = useSWR(['box', code], () => api.packingUnitByCode(code).catch(() => null));

  if (box.error) return <Banner tone="danger">{describeError(box.error).messageHe}</Banner>;
  if (box.data === undefined) return <Spinner />;

  const verdict = distributeVerdict(code, box.data);
  if (verdict.kind === 'reject') {
    return (
      <Card className="text-center">
        <p className="font-bold">{verdict.messageHe}</p>
        <Link href="/field/distribute" className="mt-4 inline-block text-link">
          חזרה לבחירת אריזה
        </Link>
      </Card>
    );
  }

  if (!confirmed) {
    return (
      <RoomConfirm
        unit={verdict.unit}
        atRoom={atRoom}
        onChange={setAtRoom}
        onConfirm={() => setConfirmed(true)}
      />
    );
  }

  // Task 8 replaces this with the item step.
  return <Banner tone="info">{`אתם ב${atRoom}. המשך התהליך נבנה במשימה הבאה.`}</Banner>;
}
