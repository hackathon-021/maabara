import {
  PACKABLE_ROOM_STATUSES,
  type ClosePackingUnitReq,
  type ClosePackingUnitResult,
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

/** Trims the destination, or returns null if any part of it is blank. */
export function normalizeDestination(d: {
  destBuilding: string;
  destFloor: string;
  destRoom: string;
}): ClosePackingUnitReq | null {
  const destBuilding = d.destBuilding.trim();
  const destFloor = d.destFloor.trim();
  const destRoom = d.destRoom.trim();
  if (!destBuilding || !destFloor || !destRoom) return null;
  return { destBuilding, destFloor, destRoom };
}

export interface Completion {
  title: string;
  lines: string[];
  tone: 'ok' | 'warn';
  canPackMore: boolean;
}

/**
 * What the packer is told after a box closes (flows/packing_flow.md nodes N–T).
 * The room status is always the server's word — the client never decides a room is closed.
 */
export function completionSummary({ unit, roomCheck }: ClosePackingUnitResult): Completion {
  const lines = [`מספר אריזה: ${unit.code ?? '—'}`];

  // A personal carton skips the room check entirely (spec §5.1).
  if (roomCheck === null) {
    return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
  }

  if (roomCheck.remaining > 0) {
    lines.push(`נותרו בחדר ${roomCheck.remaining} פריטים לאריזה`);
    return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
  }

  if (roomCheck.roomStatus === 'closed') {
    lines.push('כל הפריטים בחדר נארזו');
    return { title: 'חדר סגור', lines, tone: 'ok', canPackMore: false };
  }

  if (roomCheck.roomStatus === 'awaiting_disposal') {
    lines.push('כל הפריטים לאריזה נארזו');
    lines.push(`נותרו בחדר ${roomCheck.disposalRemaining} פריטים לגריטה`);
    return { title: 'ממתין לגריטה', lines, tone: 'warn', canPackMore: false };
  }

  // Nothing remaining but the room is still open — trust the server, offer to keep packing.
  return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
}
