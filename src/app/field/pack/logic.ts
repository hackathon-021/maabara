import { PACKABLE_ROOM_STATUSES, type PackingUnitType, type RoomDTO, type RoomStatus } from '@/lib/contracts';
import { ROOM_STATUS_LABELS } from '@/lib/labels';

/** A room may be packed once Phase A mapping finished (contracts: PACKABLE_ROOM_STATUSES). */
export function isRoomPackable(status: RoomStatus): boolean {
  return PACKABLE_ROOM_STATUSES.includes(status);
}

/**
 * The second line on a room row: who is responsible for it, or why it cannot be packed.
 * flows/packing_flow.md node F fixes the unmapped wording — it must match the server's
 * ROOM_NOT_MAPPED message so the packer reads the same sentence either way.
 */
export function roomHintHe(room: RoomDTO): string | null {
  if (isRoomPackable(room.status)) {
    return room.roomManager ? `אחראי חדר: ${room.roomManager}` : null;
  }
  if (room.status === 'waiting' || room.status === 'inProgress') return 'יש לסיים את המיפוי';
  return ROOM_STATUS_LABELS[room.status];
}

/** A personal carton is sealed without listing its contents (spec §5.1). */
export function needsItems(type: PackingUnitType): boolean {
  return type !== 'personal_carton';
}
