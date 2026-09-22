import { Prisma } from '@prisma/client';
import type {
  ClosePackingUnitReq, ClosePackingUnitResult, OpenPackingUnitReq, PackingUnitDTO, RoomCheckDTO, RoomStatus,
  SetItemsReq,
} from '@/lib/contracts';
import { db, type Tx } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { PACKING_UNIT_STATUS_LABELS, statusLabel } from '@/lib/labels';
import type { Actor } from '@/lib/session';
import { recordEvent } from './events';
import { assertRoomPackable, loadPackingUnitDTO, packableReports, roomTotals } from './queries';
import { assertTransition, ROOM_TRANSITIONS } from './transitions';

export async function openPackingUnit(actor: Actor, req: OpenPackingUnitReq): Promise<PackingUnitDTO> {
  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: req.sourceRoomId } });
    if (!room) throw Errors.notFound('חדר');
    assertRoomPackable(room);

    const unit = await tx.packingUnit.create({
      data: { type: req.type, status: 'open', sourceRoomId: room.id, packedById: actor.id },
    });
    await recordEvent(tx, {
      entityType: 'packing_unit', entityId: unit.id, fromStatus: null, toStatus: 'open', actorId: actor.id,
    });

    // The first box opened in a mapped room moves it to 'packing'; later boxes find it already there.
    if (room.status === 'done') {
      assertTransition('room', room.status, 'packing');
      await tx.room.update({ where: { id: room.id }, data: { status: 'packing' } });
      await recordEvent(tx, {
        entityType: 'room', entityId: room.id, fromStatus: room.status, toStatus: 'packing', actorId: actor.id,
      });
    }

    return loadPackingUnitDTO(tx, unit.id);
  });
}

/**
 * Replaces the whole contents of an open box (PUT semantics — the packer edits the list on screen).
 * No item events are written here; see the plan's conventions — they are written on close.
 */
export async function setPackingUnitItems(
  actor: Actor,
  packingUnitId: number,
  req: SetItemsReq,
): Promise<PackingUnitDTO> {
  return db.$transaction(async (tx) => {
    const unit = await tx.packingUnit.findUnique({ where: { id: packingUnitId } });
    if (!unit) throw Errors.notFound('אריזה');
    // Editing a box that already left the packer is out of scope for the MVP.
    if (unit.status !== 'open') {
      throw Errors.illegalTransition(statusLabel('packing_unit', unit.status), PACKING_UNIT_STATUS_LABELS.open);
    }
    if (unit.type === 'personal_carton') throw Errors.validation('קרטון אישי אינו מכיל פריטים');

    const seen = new Set<number>();
    for (const line of req.items) {
      if (seen.has(line.mappingReportId)) throw Errors.validation('אותו פריט נבחר פעמיים');
      seen.add(line.mappingReportId);
    }

    // Remaining excludes this box's own rows, so re-saving the same quantities is not a conflict.
    const reports = await packableReports(tx, unit.sourceRoomId, unit.id);
    const byId = new Map(reports.map((r) => [r.id, r]));
    for (const line of req.items) {
      const report = byId.get(line.mappingReportId);
      if (!report) throw Errors.notFound('פריט');
      if (line.quantity > report.remaining) throw Errors.quantityExceeds(report.name, report.remaining);
    }

    await tx.packingUnitItem.deleteMany({ where: { packingUnitId: unit.id } });
    if (req.items.length > 0) {
      await tx.packingUnitItem.createMany({
        data: req.items.map((line) => ({
          packingUnitId: unit.id,
          mappingReportId: line.mappingReportId,
          quantity: line.quantity,
        })),
      });
    }

    return loadPackingUnitDTO(tx, unit.id);
  });
}

const FIRST_CODE = 10_001;

/**
 * Next code = highest existing + 1. Two simultaneous closes can pick the same number; the unique
 * index catches it and closePackingUnit retries.
 * TODO: a Postgres sequence would be cleaner, but prisma/schema.prisma is P1-owned and frozen.
 */
async function allocateCode(tx: Tx): Promise<string> {
  const { _max } = await tx.packingUnit.aggregate({ _max: { code: true } });
  const next = _max.code ? Number(_max.code.trim()) + 1 : FIRST_CODE;
  if (next > 99_999) throw Errors.validation('נגמרו מספרי האריזות');
  return String(next).padStart(5, '0');
}

/** Spec §3 invariant 2: the server — never the client — decides that a room is finished. */
async function applyRoomCheck(tx: Tx, actor: Actor, roomId: number): Promise<RoomCheckDTO> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  const { remaining, disposalRemaining } = await roomTotals(tx, roomId);
  let status = room.status as RoomStatus;

  if (remaining === 0) {
    const next: RoomStatus = disposalRemaining > 0 ? 'awaiting_disposal' : 'closed';
    if (next !== status && ROOM_TRANSITIONS[status].includes(next)) {
      await tx.room.update({ where: { id: roomId }, data: { status: next } });
      await recordEvent(tx, {
        entityType: 'room', entityId: roomId, fromStatus: status, toStatus: next, actorId: actor.id,
      });
      status = next;
    }
  }

  return { remaining, disposalRemaining, roomStatus: status };
}

async function closeOnce(
  actor: Actor,
  packingUnitId: number,
  req: ClosePackingUnitReq,
): Promise<ClosePackingUnitResult> {
  return db.$transaction(async (tx) => {
    const unit = await tx.packingUnit.findUnique({ where: { id: packingUnitId }, include: { items: true } });
    if (!unit) throw Errors.notFound('אריזה');
    assertTransition('packing_unit', unit.status, 'closed');
    if (unit.type !== 'personal_carton' && unit.items.length === 0) {
      throw Errors.validation('יש לבחור פריטים לאריזה');
    }

    const code = await allocateCode(tx);
    await tx.packingUnit.update({
      where: { id: unit.id },
      data: {
        code,
        status: 'closed',
        closedAt: new Date(),
        destBuilding: req.destBuilding.trim(),
        destFloor: req.destFloor.trim(),
        destRoom: req.destRoom.trim(),
      },
    });
    await recordEvent(tx, {
      entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'closed',
      actorId: actor.id, note: `אריזה ${code}`,
    });

    // Contents become real at close — that is when each item gets its 'packed' event.
    for (const item of unit.items) {
      await recordEvent(tx, {
        entityType: 'packing_unit_item', entityId: item.id, fromStatus: null, toStatus: 'packed', actorId: actor.id,
      });
    }

    const roomCheck = unit.type === 'personal_carton' ? null : await applyRoomCheck(tx, actor, unit.sourceRoomId);
    return { unit: await loadPackingUnitDTO(tx, unit.id), roomCheck };
  });
}

/**
 * Assigns the box its 5-digit code, records the destination, marks every item packed and runs
 * the room check. A duplicate-code race (P2002 on the unique index) is retried with a fresh code.
 */
export async function closePackingUnit(
  actor: Actor,
  packingUnitId: number,
  req: ClosePackingUnitReq,
): Promise<ClosePackingUnitResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await closeOnce(actor, packingUnitId, req);
    } catch (e) {
      const duplicateCode = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (duplicateCode && attempt < 4) continue;
      throw e;
    }
  }
}
