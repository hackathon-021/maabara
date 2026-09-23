'use client';

import { useEffect, useState } from 'react';
import { Banner, Card, EmptyState, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { LeaderboardEntryDTO } from '@/lib/contracts';
import { RANK_LABELS, ROLE_LABELS } from '@/lib/labels';

const MEDALS = ['🥇', '🥈', '🥉'];

// Podium visual order (peak in the middle): 2nd, 1st, 3rd.
const PODIUM_ORDER = [1, 0, 2];

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntryDTO[] | null>(null);
  const { error, run } = useAction();

  useEffect(() => {
    void run(() => api.leaderboard(), setEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !entries) return <Banner tone="danger">{error}</Banner>;
  if (!entries) return <Spinner label="טוען טבלת דירוג…" />;

  if (entries.length === 0) {
    return <EmptyState title="אין עדיין משתמשים" body="פעולות שבוצעו יופיעו כאן" />;
  }

  const podium = PODIUM_ORDER.map((i) => entries[i]).filter((e): e is LeaderboardEntryDTO => e !== undefined);

  return (
    <div className="flex flex-col gap-4">
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-2">
          {podium.map((entry) => {
            const place = entries.indexOf(entry) + 1;
            const isFirst = place === 1;
            return (
              <Card
                key={entry.id}
                className={`flex-1 text-center ${isFirst ? 'border-2 border-primary pb-6' : ''}`}
              >
                <p className="text-2xl">{MEDALS[place - 1]}</p>
                <p className="mt-1 truncate font-bold">{entry.name}</p>
                <p className="text-sm text-ink-muted">{entry.actionCount} פעולות</p>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <Card key={entry.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-6 text-center font-bold text-ink-muted">{i + 1}</span>
              <div>
                <p className="font-bold">{entry.name}</p>
                <p className="text-sm text-ink-muted">
                  {RANK_LABELS[entry.rank]}
                  {entry.role && ` · ${ROLE_LABELS[entry.role]}`}
                </p>
              </div>
            </div>
            <span className="font-bold text-primary">{entry.actionCount}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
