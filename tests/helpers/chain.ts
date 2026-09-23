import type { PackingUnitDTO, PackingUnitType, Rank, Role, TransportUnitDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import {
  closePackingUnit, createTransportUnit, loadTransportUnit, openPackingUnit, setPackingUnitItems,
} from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';

export const DEFAULT_DEST = { destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' };

/** Turns a fixture user id into the Actor every lifecycle action expects. */
export async function actorOf(userId: number): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null, rank: u.rank as Rank };
}

export interface PackBoxOptions {
  roomId: number;
  items?: { mappingReportId: number; quantity: number }[];
  type?: PackingUnitType;
  dest?: { destBuilding: string; destFloor: string; destRoom: string };
}

/** Opens a box, fills it and closes it. Returns the closed box, code assigned. */
export async function packBox(actor: Actor, opts: PackBoxOptions): Promise<PackingUnitDTO> {
  const type = opts.type ?? 'professional_carton';
  const unit = await openPackingUnit(actor, { sourceRoomId: opts.roomId, type });
  if (type !== 'personal_carton') {
    await setPackingUnitItems(actor, unit.id, { items: opts.items ?? [] });
  }
  const { unit: closed } = await closePackingUnit(actor, unit.id, opts.dest ?? DEFAULT_DEST);
  return closed;
}

/** Creates a truck and sends it off with the given box codes. */
export async function loadTruck(
  actor: Actor,
  opts: { groupId: number; codes: string[]; licensePlate?: string },
): Promise<TransportUnitDTO> {
  const truck = await createTransportUnit(actor, {
    type: 'truck',
    licensePlate: opts.licensePlate ?? '12-345-67',
    groupId: opts.groupId,
  });
  return loadTransportUnit(actor, truck.id, { codes: opts.codes });
}
