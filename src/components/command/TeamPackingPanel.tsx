'use client';

import useSWR from 'swr';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { RANK_LEVEL, type TeamPackingStatDTO } from '@/lib/contracts';
import { RANK_LABELS } from '@/lib/labels';

/** Highest rank first, then name — so ramad/raan rollup rows lead each cluster. */
function sortedStats(stats: TeamPackingStatDTO[]): TeamPackingStatDTO[] {
  return [...stats].sort((a, b) => RANK_LEVEL[b.rank] - RANK_LEVEL[a.rank] || a.name.localeCompare(b.name));
}

export function TeamPackingPanel() {
  const { data, error } = useSWR('team-stats', api.teamStats, { refreshInterval: 3000, keepPreviousData: true });

  return (
    <Card>
      <p className="mb-3 font-bold">אריזה לפי חבר צוות</p>
      {error && !data && <p className="text-sm text-ink-muted">אין תקשורת עם השרת</p>}
      {!error && !data && <Spinner label="טוען…" />}
      {data && data.length === 0 && (
        <EmptyState title="אין פקודים עדיין" body="נתוני אריזה יופיעו כאן לאחר שיוך פקודים" />
      )}
      {data && data.length > 0 && (
        <div className="flex flex-col gap-2">
          {sortedStats(data).map((s) => {
            const hasSubordinates = s.totalBoxCount !== s.ownBoxCount || s.totalItemCount !== s.ownItemCount;
            return (
              <div key={s.id} className="flex items-center justify-between border-b border-[#E5E5EA] pb-2 last:border-0">
                <div>
                  <p className="font-bold">{s.name}</p>
                  <p className="text-sm text-ink-muted">{RANK_LABELS[s.rank]}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm">{s.ownBoxCount} אריזות · {s.ownItemCount} פריטים</p>
                  {hasSubordinates && (
                    <p className="text-xs text-ink-muted">
                      כולל פקודים: {s.totalBoxCount} אריזות · {s.totalItemCount} פריטים
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
