import { hasCommanderPermission } from '@/lib/command';
import type { PendingApprovalDTO, Rank } from '@/lib/contracts';
import { RANK_LEVEL } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

/**
 * Signup gate: a new user requests approval from a commander by id. Their
 * commanderId stays null until that commander approves — nothing else can
 * set it (see approveRequest). No cycle check needed: a pending user has no
 * commanderId yet, so they cannot be anyone's ancestor.
 */
export async function submitApprovalRequest(userId: number, commanderId: number): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.approvalStatus !== 'pending') throw Errors.validation('הבקשה כבר טופלה');
  if (commanderId === userId) throw Errors.validation('לא ניתן לבקש אישור מעצמך');
  const commander = await db.user.findUnique({ where: { id: commanderId } });
  if (!commander) throw Errors.notFound('מפקד');
  if (!hasCommanderPermission(commander.rank as Rank)) throw Errors.validation('משתמש זה אינו מפקד');
  await db.user.update({ where: { id: userId }, data: { requestedCommanderId: commanderId } });
}

/** Requests aimed at this commander, still awaiting a decision. */
export async function getPendingApprovalRequests(actorId: number): Promise<PendingApprovalDTO[]> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  const rows = await db.user.findMany({
    where: { requestedCommanderId: actorId, approvalStatus: 'pending' },
    select: { id: true, name: true, email: true, rank: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, rank: r.rank as Rank }));
}

async function loadPendingRequest(actorId: number, subordinateId: number) {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  const subordinate = await db.user.findUnique({ where: { id: subordinateId } });
  if (!subordinate) throw Errors.notFound('משתמש');
  if (subordinate.requestedCommanderId !== actorId || subordinate.approvalStatus !== 'pending') {
    throw Errors.validation('אין בקשת אישור ממתינה ממשתמש זה');
  }
  return { actor, subordinate };
}

/** Sets commanderId and locks it — from here on only a direct DB edit can move this user. */
export async function approveRequest(actorId: number, subordinateId: number): Promise<void> {
  const { actor, subordinate } = await loadPendingRequest(actorId, subordinateId);
  if (RANK_LEVEL[subordinate.rank as Rank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן לאשר משתמש בדרגה שווה או גבוהה משלך');
  }
  await db.user.update({
    where: { id: subordinateId },
    data: { commanderId: actorId, approvalStatus: 'approved' },
  });
}

/** Sends the requester back to the request step so they can pick a different commander. */
export async function rejectRequest(actorId: number, subordinateId: number): Promise<void> {
  await loadPendingRequest(actorId, subordinateId);
  await db.user.update({ where: { id: subordinateId }, data: { requestedCommanderId: null } });
}
