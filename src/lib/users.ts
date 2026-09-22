import type { User } from '@prisma/client';
import { ROLES, type MeDTO, type Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export function toMeDTO(u: User): MeDTO {
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role | null };
}

export async function ensureUser(email: string, name: string): Promise<User> {
  return db.user.upsert({ where: { email }, update: {}, create: { email, name } });
}

export async function setUserRole(userId: number, role: string): Promise<MeDTO> {
  if (!(ROLES as readonly string[]).includes(role)) throw Errors.validation('תפקיד לא חוקי');
  return toMeDTO(await db.user.update({ where: { id: userId }, data: { role } }));
}
