'use client';

import { useEffect, useState } from 'react';
import { Banner, Button, Card, EmptyState, OptionList, TextField, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { RANKS, RANK_LEVEL, type Rank, type SubordinateStatusDTO } from '@/lib/contracts';
import { RANK_LABELS, ROLE_LABELS } from '@/lib/labels';

export function TeamView({ actorId, actorRank }: { actorId: number; actorRank: Rank }) {
  const [subordinates, setSubordinates] = useState<SubordinateStatusDTO[] | null>(null);
  const [newSubordinateId, setNewSubordinateId] = useState('');
  const { busy, error, run } = useAction();

  function load() {
    void run(() => api.subtree(), setSubordinates);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promotableRanks = RANKS.filter((r) => RANK_LEVEL[r] < RANK_LEVEL[actorRank]);

  function assign() {
    const subordinateId = Number(newSubordinateId);
    if (!Number.isInteger(subordinateId) || subordinateId <= 0) return;
    void run(
      () => api.assignSubordinate({ subordinateId }),
      () => {
        setNewSubordinateId('');
        load();
      },
    );
  }

  function remove(id: number) {
    void run(() => api.removeSubordinate(id), load);
  }

  function promote(userId: number, rank: Rank) {
    void run(() => api.setRank({ userId, rank }), load);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">הצוות שלי</h1>

      <Card>
        <p className="mb-2 font-bold">שיוך פקוד</p>
        {/* TODO: numeric id entry until a user-directory search endpoint exists. */}
        <TextField label="מזהה משתמש" value={newSubordinateId} onChange={setNewSubordinateId} inputMode="numeric" />
        <div className="mt-2">
          <Button onClick={assign} busy={busy} disabled={!newSubordinateId}>
            שייך
          </Button>
        </div>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {subordinates !== null && subordinates.length === 0 && (
        <EmptyState title="אין פקודים עדיין" body="שייכו פקוד ראשון כדי לראות אותו כאן" />
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
              <div className="mt-2 flex flex-col gap-2">
                {promotableRanks.length > 0 && (
                  <OptionList
                    options={promotableRanks.map((r) => ({ value: r, label: RANK_LABELS[r] }))}
                    value={s.rank}
                    onChange={(r) => promote(s.id, r)}
                  />
                )}
                {s.commanderId === actorId && (
                  <Button variant="quiet" size="md" onClick={() => remove(s.id)} busy={busy}>
                    הסר משיוך ישיר
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
