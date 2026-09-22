import { db } from '@/lib/db';
import type { Role } from '@/lib/contracts';
import type { Actor } from '@/lib/session';

/** Turns a fixture user id into the Actor every lifecycle action expects. */
export async function actorOf(userId: number): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}
