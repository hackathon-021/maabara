import {
  PACKABLE_ROOM_STATUSES,
  type PackableItemDTO,
  type PackingUnitItemDTO,
  type PackingUnitType,
  type RoomDTO,
  type RoomStatus,
  type SetItemsReq,
} from '@/lib/contracts';
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

export interface ItemRow {
  mappingReportId: number;
  name: string;
  serial: string | null;
  /** null when the row comes only from the box's own contents — the mapping status is not on that DTO. */
  status: 'transfer' | 'salvage' | null;
  max: number;
  initial: number;
}

/**
 * Merges what the room still has with what this box already holds.
 *
 * GET /api/rooms/:id/packable-items subtracts *every* box's contents, this one included,
 * and drops an item once nothing remains. Both are right for a fresh box and wrong for a
 * box being edited, so the box's own rows are added back onto the maximum, and an item
 * that vanished from the room list because it is all in this box is re-added.
 */
export function itemRows(packable: PackableItemDTO[], saved: PackingUnitItemDTO[]): ItemRow[] {
  const mine = new Map(saved.map((s) => [s.mappingReportId, s]));
  const rows: ItemRow[] = packable.map((p) => {
    const own = mine.get(p.mappingReportId);
    return {
      mappingReportId: p.mappingReportId,
      name: p.name,
      serial: p.serial,
      status: p.status,
      max: p.remaining + (own?.quantity ?? 0),
      initial: own?.quantity ?? 0,
    };
  });

  const listed = new Set(rows.map((r) => r.mappingReportId));
  for (const own of saved) {
    if (listed.has(own.mappingReportId)) continue;
    rows.push({
      mappingReportId: own.mappingReportId,
      name: own.name,
      serial: own.serial,
      status: null,
      max: own.quantity,
      initial: own.quantity,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function draftToRequest(draft: Record<number, number>): SetItemsReq {
  return {
    items: Object.entries(draft)
      .filter(([, quantity]) => quantity > 0)
      .map(([mappingReportId, quantity]) => ({ mappingReportId: Number(mappingReportId), quantity })),
  };
}

export function draftTotal(draft: Record<number, number>): number {
  return Object.values(draft).reduce((sum, n) => sum + n, 0);
}

/** A non-personal box with nothing in it is rejected by the server — block it on the phone. */
export function canLeaveContents(type: PackingUnitType, draft: Record<number, number>): boolean {
  return !needsItems(type) || draftTotal(draft) > 0;
}
