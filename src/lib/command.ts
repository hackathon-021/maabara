import type { Rank, Role, SubordinateStatusDTO } from '@/lib/contracts';
import { RANK_LEVEL } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

export function hasCommanderPermission(rank: Rank): boolean {
  return rank !== 'soldier';
}

/** Walks commanderId upward from userId. True if candidateAncestorId is anywhere in that chain. */
export async function isAncestor(candidateAncestorId: number, userId: number): Promise<boolean> {
  let current = await db.user.findUnique({ where: { id: userId }, select: { commanderId: true } });
  while (current?.commanderId != null) {
    if (current.commanderId === candidateAncestorId) return true;
    current = await db.user.findUnique({ where: { id: current.commanderId }, select: { commanderId: true } });
  }
  return false;
}

/** Any commander self-assigns; overwrites a prior commander link if one exists. */
export async function assignSubordinate(actorId: number, subordinateId: number): Promise<void> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  if (subordinateId === actorId) throw Errors.validation('לא ניתן להיות הפקוד של עצמך');
  if (await isAncestor(subordinateId, actorId)) {
    throw Errors.validation('שיוך זה יוצר מעגל בשרשרת הפיקוד');
  }
  const subordinate = await db.user.findUnique({ where: { id: subordinateId } });
  if (!subordinate) throw Errors.notFound('משתמש');
  if (RANK_LEVEL[subordinate.rank as Rank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן לשייך אליך משתמש בדרגה שווה או גבוהה משלך');
  }
  await db.user.update({ where: { id: subordinateId }, data: { commanderId: actorId } });
}

/** Only the direct commander may remove the link. */
export async function removeSubordinate(actorId: number, subordinateId: number): Promise<void> {
  const subordinate = await db.user.findUniqueOrThrow({ where: { id: subordinateId } });
  if (subordinate.commanderId !== actorId) throw Errors.validation('פקוד זה אינו משויך אליך ישירות');
  await db.user.update({ where: { id: subordinateId }, data: { commanderId: null } });
}

/**
 * A commander may set the rank of anyone in their own subtree, to any rank
 * strictly below their own. Demoting to soldier orphans that user's own
 * direct subordinates (they are not reassigned up the chain).
 */
export async function setRank(actorId: number, targetId: number, newRank: Rank): Promise<void> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  if (!(await isAncestor(actorId, targetId))) throw Errors.validation('משתמש זה אינו בשרשרת הפיקוד שלך');
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw Errors.notFound('משתמש');
  if (RANK_LEVEL[target.rank as Rank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן לשנות דרגה של משתמש בדרגה שווה או גבוהה משלך');
  }
  if (RANK_LEVEL[newRank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן להעניק דרגה השווה או גבוהה משלך');
  }
  await db.user.update({ where: { id: targetId }, data: { rank: newRank } });
  if (newRank === 'soldier') {
    await db.user.updateMany({ where: { commanderId: targetId }, data: { commanderId: null } });
  }
}

/** Every descendant of rootId, breadth-first. Excludes rootId itself. */
export async function getSubtreeIds(rootId: number): Promise<number[]> {
  const ids: number[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db.user.findMany({
      where: { commanderId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

/** The commander tab's data: every descendant, with their latest activity if any. */
export async function getSubordinateStatuses(actorId: number): Promise<SubordinateStatusDTO[]> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');

  const subtreeIds = await getSubtreeIds(actorId);
  if (subtreeIds.length === 0) return [];

  const [users, events] = await Promise.all([
    db.user.findMany({ where: { id: { in: subtreeIds } } }),
    db.statusEvent.findMany({
      where: { actorId: { in: subtreeIds } },
      orderBy: { at: 'desc' },
      select: { actorId: true, at: true, toStatus: true, entityType: true },
    }),
  ]);

  // Ordered newest first, so the first row seen for a user is their latest event.
  const latest = new Map<number, { at: Date; label: string }>();
  for (const e of events) {
    if (!latest.has(e.actorId)) {
      latest.set(e.actorId, { at: e.at, label: statusLabel(e.entityType, e.toStatus) });
    }
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    rank: u.rank as Rank,
    role: u.role as Role | null,
    commanderId: u.commanderId,
    lastActivityAt: latest.get(u.id)?.at.toISOString() ?? null,
    lastActivityLabel: latest.get(u.id)?.label ?? null,
  }));
}
