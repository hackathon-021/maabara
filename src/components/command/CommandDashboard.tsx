'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, describeError, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { DashboardDTO } from '@/lib/contracts';
import { BoxSearch } from './BoxSearch';
import { ExceptionsPanel } from './ExceptionsPanel';
import { HeroProgress, KpiTiles } from './KpiTiles';
import { freshnessLabel } from './logic';
import { RoomBoxes } from './RoomBoxes';
import { RoomsGrid } from './RoomsGrid';
import { SmsFeed } from './SmsFeed';
import { TeamPackingPanel } from './TeamPackingPanel';
import { TrucksPanel } from './TrucksPanel';

/** Spec §1: poll every 3 seconds. No WebSockets. */
const POLL_MS = 3000;

export function CommandDashboard({ showTeamPacking }: { showTeamPacking: boolean }) {
  const { data, error } = useSWR('dashboard', api.dashboard, {
    refreshInterval: POLL_MS,
    keepPreviousData: true,
  });

  const [openRoom, setOpenRoom] = useState<DashboardDTO['rooms'][number] | null>(null);

  // Re-render once a second so the freshness line counts up between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

      <BoxSearch />
      <HeroProgress kpis={data.kpis} />
      <KpiTiles kpis={data.kpis} />

      {showTeamPacking && <TeamPackingPanel />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RoomsGrid rooms={data.rooms} onOpen={setOpenRoom} />
        </div>
        {/* Exceptions above trucks on purpose: the inspector persona opens this
            screen to find gaps, not to admire progress. */}
        <div className="flex flex-col gap-4">
          <ExceptionsPanel exceptions={data.exceptions} />
          <TrucksPanel trucks={data.trucks} />
          <SmsFeed notifications={data.notifications} />
        </div>
      </div>

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
