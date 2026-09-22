import type { OpenPackingUnitReq, PackingUnitDTO, SetItemsReq } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { PACKING_UNIT_STATUS_LABELS, statusLabel } from '@/lib/labels';
import type { Actor } from '@/lib/session';
import { recordEvent } from './events';
import { assertRoomPackable, loadPackingUnitDTO, packableReports } from './queries';
import { assertTransition } from './transitions';

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
