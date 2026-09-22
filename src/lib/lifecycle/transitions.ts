import type { EntityType, ItemStatus, PackingUnitStatus, RoomStatus } from '@/lib/contracts';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

/**
 * 'unloaded' (יחידת הובלה נפרקה במלואה) is a transport pseudo-status: the receive action writes
 * it as an event but never stores it on the row, which goes straight from in_transit to released.
 */
export const TRANSPORT_UNLOADED = 'unloaded';

export const PACKING_UNIT_TRANSITIONS: Record<PackingUnitStatus, readonly PackingUnitStatus[]> = {
  open: ['closed'],
  closed: ['in_transit'],
  in_transit: ['received', 'missing'],
  received: ['distributed', 'distributed_short'],
  missing: [],
  distributed: [],
  distributed_short: [],
};

export const ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  packed: ['received', 'missing'],
  received: ['distributed', 'short'],
  missing: [],
  distributed: [],
  short: [],
};

export const TRANSPORT_TRANSITIONS: Record<string, readonly string[]> = {
  loading: ['in_transit'],
  in_transit: [TRANSPORT_UNLOADED],
  [TRANSPORT_UNLOADED]: ['released'],
  released: [],
};

// TODO: waiting/inProgress/done belong to Phase A mapping; listed so a stale room can't be packed.
export const ROOM_TRANSITIONS: Record<RoomStatus, readonly RoomStatus[]> = {
  waiting: ['inProgress'],
  inProgress: ['done'],
  done: ['packing'],
  packing: ['closed', 'awaiting_disposal'],
  awaiting_disposal: ['closed'],
  closed: [],
};

const TABLES: Record<EntityType, Record<string, readonly string[]>> = {
  packing_unit: PACKING_UNIT_TRANSITIONS,
  packing_unit_item: ITEM_TRANSITIONS,
  transport_unit: TRANSPORT_TRANSITIONS,
  room: ROOM_TRANSITIONS,
};

/**
 * Throws ILLEGAL_TRANSITION unless `from` → `to` is listed for this entity type.
 * `from === null` means the row is being created, which is always allowed.
 */
export function assertTransition(entityType: EntityType, from: string | null, to: string): void {
  if (from === null) return;
  if (!TABLES[entityType][from]?.includes(to)) {
    throw Errors.illegalTransition(statusLabel(entityType, from), statusLabel(entityType, to));
  }
}
