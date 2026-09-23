import type { User } from '@prisma/client';
import { ROLES, type MeDTO, type Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export function toMeDTO(u: User): MeDTO {
  // actionCount defaults to 0 here; callers that need the real count should query StatusEvent.
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role | null, actionCount: 0 };
}

export async function ensureUser(email: string, name: string): Promise<User> {
  return db.user.upsert({ where: { email }, update: {}, create: { email, name } });
}

export async function setUserRole(userId: number, role: string): Promise<MeDTO> {
  if (!(ROLES as readonly string[]).includes(role)) throw Errors.validation('תפקיד לא חוקי');
  return toMeDTO(await db.user.update({ where: { id: userId }, data: { role } }));
}

/**
 * Counts high-level completed actions for a user — 1 point per completed operational unit:
 *   • Packed & sealed a box (packing_unit -> closed)
 *   • Dispatched a transport unit (transport_unit -> in_transit)
 *   • Released a received transport unit (transport_unit -> released)
 *   • Distributed a box (packing_unit -> distributed or distributed_short)
 *
 * Intermediate steps (opening a box, individual item rows, internal status transitions)
 * do not count as separate actions, so packing one box counts as exactly 1 action.
 */
export async function countUserActions(actorId: number): Promise<number> {
  return db.statusEvent.count({
    where: {
      actorId,
      OR: [
        { entityType: 'packing_unit', toStatus: 'closed' },
        { entityType: 'transport_unit', toStatus: 'in_transit' },
        { entityType: 'transport_unit', toStatus: 'released' },
        { entityType: 'packing_unit', toStatus: 'distributed' },
        { entityType: 'packing_unit', toStatus: 'distributed_short' },
      ],
    },
  });
}

