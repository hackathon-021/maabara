import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Rank, Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
  rank: Rank;
}

export const DEV_EMAIL = 'dev@maabara.local';

export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander', rank: 'unit_commander' },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null, rank: u.rank as Rank };
}

async function currentActor(): Promise<Actor | null> {
  // TODO: local-dev escape hatch. Must never be set in production (P1 Task 6).
  if (process.env.AUTH_BYPASS === '1') return devActor();
  const session = await auth();
  if (!session?.appUserId) return null;
  const u = await db.user.findUnique({ where: { id: session.appUserId } });
  return u
    ? { id: u.id, name: u.name, email: u.email, role: u.role as Role | null, rank: u.rank as Rank }
    : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw Errors.unauthenticated();
  return actor;
}

export async function requirePageActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!actor.role) redirect('/role');
  return actor;
}
