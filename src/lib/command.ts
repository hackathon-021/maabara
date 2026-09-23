import type { Rank, Role, SubordinateStatusDTO, TeamPackingStatDTO } from '@/lib/contracts';
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

/**
 * A commander may set the rank of anyone in their own subtree, to any rank
 * strictly below their own. Demoting to soldier orphans that user's own
 * direct subordinates (they are not reassigned up the chain).
 *
 * Promoting TO unit_commander is the one exception: it requires isAdmin and
 * is not restricted to the actor's own subtree — see /lib/approval.ts for
 * why commanderId is otherwise locked once approved.
 */
export async function setRank(actorId: number, targetId: number, newRank: Rank): Promise<void> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });

  if (newRank === 'unit_commander') {
    if (!actor.isAdmin) throw Errors.forbidden('רק מנהל מערכת יכול למנות מפקד יחידה');
    const target = await db.user.findUnique({ where: { id: targetId } });
    if (!target) throw Errors.notFound('משתמש');
    await db.user.update({ where: { id: targetId }, data: { rank: newRank } });
    return;
  }

  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  if (!(await isAncestor(actorId, targetId))) throw Errors.validation('משתמש זה אינו בשרשרת הפיקוד שלך');
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw Errors.notFound('משתמש');
  if (RANK_LEVEL[target.rank as Rank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן לשנות דרגה של משתמש בדרגה שווה או גבוהה משלך');
  }
  if (RANK_LEVEL[newRank] !== RANK_LEVEL[actor.rank as Rank] - 1) {
    throw Errors.validation('ניתן להעניק דרגה אחת מתחת לדרגתך בלבד');
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

/**
 * The dashboard's team-packing panel: for every subtree member, their own
 * packed boxes/items and the rollup of everyone under them (so a raan's row
 * shows their ramads' soldiers' output too, not just their own).
 */
export async function getTeamPackingStats(actorId: number): Promise<TeamPackingStatDTO[]> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');

  const subtreeIds = await getSubtreeIds(actorId);
  if (subtreeIds.length === 0) return [];

  const [users, units] = await Promise.all([
    db.user.findMany({ where: { id: { in: subtreeIds } } }),
    db.packingUnit.findMany({
      where: { packedById: { in: subtreeIds } },
      select: { packedById: true, items: { select: { quantity: true } } },
    }),
  ]);

  const own = new Map<number, { boxes: number; items: number }>();
  for (const unit of units) {
    const cur = own.get(unit.packedById) ?? { boxes: 0, items: 0 };
    cur.boxes += 1;
    cur.items += unit.items.reduce((sum, item) => sum + item.quantity, 0);
    own.set(unit.packedById, cur);
  }

  const childrenOf = new Map<number, number[]>();
  for (const u of users) {
    if (u.commanderId == null) continue;
    const kids = childrenOf.get(u.commanderId) ?? [];
    kids.push(u.id);
    childrenOf.set(u.commanderId, kids);
  }

  function rollup(id: number): { boxes: number; items: number } {
    const base = own.get(id) ?? { boxes: 0, items: 0 };
    let boxes = base.boxes;
    let items = base.items;
    for (const childId of childrenOf.get(id) ?? []) {
      const child = rollup(childId);
      boxes += child.boxes;
      items += child.items;
    }
    return { boxes, items };
  }

  return users.map((u) => {
    const o = own.get(u.id) ?? { boxes: 0, items: 0 };
    const total = rollup(u.id);
    return {
      id: u.id,
      name: u.name,
      rank: u.rank as Rank,
      commanderId: u.commanderId,
      ownBoxCount: o.boxes,
      ownItemCount: o.items,
      totalBoxCount: total.boxes,
      totalItemCount: total.items,
    };
  });
}
