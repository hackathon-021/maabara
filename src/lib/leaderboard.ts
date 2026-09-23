import type { LeaderboardEntryDTO, Rank, Role } from '@/lib/contracts';
import { db } from '@/lib/db';

/**
 * Every user, ranked by total status events recorded as actor (most actions first).
 * TODO: system-wide for the MVP; scope to the actor's group/command chain once hierarchy lands (P1 Task 6).
 */
export async function getLeaderboard(): Promise<LeaderboardEntryDTO[]> {
  const [users, counts] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, rank: true, role: true } }),
    db.statusEvent.groupBy({ by: ['actorId'], _count: { _all: true } }),
  ]);

  const countByActorId = new Map(counts.map((c) => [c.actorId, c._count._all]));

  return users
    .map((u) => ({
      id: u.id,
      name: u.name,
      rank: u.rank as Rank,
      role: u.role as Role | null,
      actionCount: countByActorId.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.actionCount - a.actionCount || a.name.localeCompare(b.name, 'he'));
}
