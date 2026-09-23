'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, describeError, Spinner } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { api } from '@/lib/api/client';
import { HeroProgress, KpiTiles } from './KpiTiles';
import { freshnessLabel } from './logic';
import { RoomBoxes } from './RoomBoxes';
import { RoomsGrid } from './RoomsGrid';

/** Spec §1: poll every 3 seconds. No WebSockets. */
const POLL_MS = 3000;

export function CommandDashboard() {
  const { data, error } = useSWR('dashboard', api.dashboard, {
    refreshInterval: POLL_MS,
    keepPreviousData: true,
  });

  // Re-render once a second so the freshness line counts up between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [openRoom, setOpenRoom] = useState<DashboardDTO['rooms'][number] | null>(null);

  // Only a dashboard that has never loaded shows an error instead of content.
  if (error && !data) return <Banner tone="danger">{describeError(error).messageHe}</Banner>;
  if (!data) return <Spinner label="טוען תמונת מצב…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-white/80">{freshnessLabel(data.generatedAt, now)}</p>
        {/* A failed poll leaves the last good numbers up, with a note. */}
        {error && <p className="text-sm text-white">אין תקשורת עם השרת — המספרים אינם מתעדכנים</p>}
      </div>

      <HeroProgress kpis={data.kpis} />
      <KpiTiles kpis={data.kpis} />

      <RoomsGrid rooms={data.rooms} onOpen={setOpenRoom} />

      {openRoom && (
        <RoomBoxes
          roomId={openRoom.id}
          roomName={openRoom.description}
          onClose={() => setOpenRoom(null)}
        />
      )}
    </div>
  );
}
