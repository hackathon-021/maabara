'use client';

import { useEffect, useState } from 'react';
import { Banner, Button, Card, EmptyState, OptionList, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { RANKS, RANK_LEVEL, type PendingApprovalDTO, type Rank, type SubordinateStatusDTO } from '@/lib/contracts';
import { RANK_LABELS, ROLE_LABELS } from '@/lib/labels';

export function TeamView({
  actorRank, actorIsAdmin,
}: { actorRank: Rank; actorIsAdmin: boolean }) {
  const [subordinates, setSubordinates] = useState<SubordinateStatusDTO[] | null>(null);
  const [pending, setPending] = useState<PendingApprovalDTO[] | null>(null);
  const { busy, error, run } = useAction();

  function load() {
    void run(() => api.subtree(), setSubordinates);
    void run(() => api.pendingApprovals(), setPending);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promotableRanks = RANKS.filter(
    (r) => RANK_LEVEL[r] === RANK_LEVEL[actorRank] - 1 || (actorIsAdmin && r === 'unit_commander'),
  );

  function approve(id: number) {
    void run(() => api.approveRequest(id), load);
  }

  function reject(id: number) {
    void run(() => api.rejectRequest(id), load);
  }

  function promote(userId: number, rank: Rank) {
    void run(() => api.setRank({ userId, rank }), load);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">הצוות שלי</h1>

      {error && <Banner tone="danger">{error}</Banner>}

      <div>
        <p className="mb-2 font-bold">בקשות ממתינות לאישור</p>
        {pending !== null && pending.length === 0 && (
          <EmptyState title="אין בקשות ממתינות" body="בקשות הצטרפות אליך יופיעו כאן" />
        )}
        {pending !== null && pending.length > 0 && (
          <div className="flex flex-col gap-3">
            {pending.map((p) => (
              <Card key={p.id}>
                <p className="font-bold">{p.name}</p>
                <p className="text-sm text-ink-muted">{p.email} · {RANK_LABELS[p.rank]}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="md" onClick={() => approve(p.id)} busy={busy}>אשר</Button>
                  <Button variant="quiet" size="md" onClick={() => reject(p.id)} busy={busy}>דחה</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {subordinates !== null && subordinates.length === 0 && (
        <EmptyState title="אין פקודים עדיין" body="אשרו בקשת הצטרפות ראשונה כדי לראות אותה כאן" />
      )}

      {subordinates !== null && subordinates.length > 0 && (
        <div className="flex flex-col gap-3">
          {subordinates.map((s) => (
            <Card key={s.id}>
              <p className="font-bold">{s.name}</p>
              <p className="text-sm text-ink-muted">
                {RANK_LABELS[s.rank]}
                {s.role && ` · ${ROLE_LABELS[s.role]}`}
              </p>
              <p className="text-sm text-ink-muted">{s.lastActivityLabel ?? 'אין פעילות עדיין'}</p>
              {promotableRanks.length > 0 && (
                <div className="mt-2">
                  <OptionList
                    options={promotableRanks.map((r) => ({ value: r, label: RANK_LABELS[r] }))}
                    value={s.rank}
                    onChange={(r) => promote(s.id, r)}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
