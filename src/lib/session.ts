import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { ApprovalStatus, Rank, Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
  rank: Rank;
  approvalStatus: ApprovalStatus;
  requestedCommanderId: number | null;
  isAdmin: boolean;
}

export const DEV_EMAIL = 'dev@maabara.local';

/**
 * The AUTH_BYPASS dev user is exempt from the approval gate — always
 * approved and admin, so local dev never gets stuck behind it.
 */
export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: { rank: 'unit_commander', approvalStatus: 'approved', isAdmin: true },
    create: {
      email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander', rank: 'unit_commander',
      approvalStatus: 'approved', isAdmin: true,
    },
  });
  return toActor(u);
}

function toActor(u: {
  id: number; name: string; email: string; role: string | null; rank: string;
  approvalStatus: string; requestedCommanderId: number | null; isAdmin: boolean;
}): Actor {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role | null,
    rank: u.rank as Rank,
    approvalStatus: u.approvalStatus as ApprovalStatus,
    requestedCommanderId: u.requestedCommanderId,
    isAdmin: u.isAdmin,
  };
}

async function currentActor(): Promise<Actor | null> {
  // TODO: local-dev escape hatch. Must never be set in production (P1 Task 6).
  if (process.env.AUTH_BYPASS === '1') return devActor();
  const session = await auth();
  if (!session?.appUserId) return null;
  const u = await db.user.findUnique({ where: { id: session.appUserId } });
  return u ? toActor(u) : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw Errors.unauthenticated();
  return actor;
}

/** Authenticated, but no approval/role gate — for /login, /approval/* pages themselves. */
export async function requireAnyPageActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  return actor;
}

export async function requirePageActor(): Promise<Actor> {
  const actor = await requireAnyPageActor();
  if (actor.approvalStatus === 'pending') {
    redirect(actor.requestedCommanderId == null ? '/approval/request' : '/approval/pending');
  }
  if (!actor.role) redirect('/role');
  return actor;
}
