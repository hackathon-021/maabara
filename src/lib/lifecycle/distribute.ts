import type { DistributeReq, ItemStatus, PackingUnitDTO, PackingUnitStatus } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import type { Actor } from '@/lib/session';
import { notify, recordEvent } from './events';
import { loadPackingUnitDTO } from './queries';
import { assertTransition } from './transitions';

/**
 * Spec §5.4. Sent once with the final set. Anything the distributor did not hand over ends
 * `short` with its shortfall recorded — an untouched item is a loss, not a success.
 */
export async function distributePackingUnit(
  actor: Actor,
  packingUnitId: number,
  req: DistributeReq,
): Promise<PackingUnitDTO> {
  return db.$transaction(
    async (tx) => {
      const unit = await tx.packingUnit.findUnique({
        where: { id: packingUnitId },
        include: { items: { include: { mappingReport: { include: { subCategory: true } } } } },
      });
      if (!unit) throw Errors.notFound('אריזה');
      // Both distributed and distributed_short leave `received`, so this rejects anything else.
      assertTransition('packing_unit', unit.status, 'distributed');

      const atRoom = req.atRoom.trim();
      // Spec §5.4: the distributor may override a destination mismatch; the override is logged.
      const note =
        unit.destRoom && atRoom !== unit.destRoom
          ? `פוזר בחדר ${atRoom} — לא תואם ליעד ${unit.destRoom}`
          : `פוזר בחדר ${atRoom}`;

      if (unit.type === 'personal_carton') {
        if (req.items.length > 0) throw Errors.validation('קרטון אישי אינו מכיל פריטים');
        await tx.packingUnit.update({ where: { id: unit.id }, data: { status: 'distributed' } });
        await recordEvent(tx, {
          entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'distributed',
          actorId: actor.id, note,
        });
        return loadPackingUnitDTO(tx, unit.id);
      }

      const byId = new Map(unit.items.map((i) => [i.id, i]));
      const asked = new Map<number, number>();
      for (const line of req.items) {
        const item = byId.get(line.packingUnitItemId);
        if (!item) throw Errors.notFound('פריט');
        if (asked.has(item.id)) throw Errors.validation('אותו פריט נבחר פעמיים');
        const max = item.quantity - item.distributedQuantity;
        if (line.quantity > max) throw Errors.quantityExceeds(item.mappingReport.subCategory.description, max);
        asked.set(item.id, line.quantity);
      }

      const shortages: string[] = [];
      for (const item of unit.items) {
        const distributed = item.distributedQuantity + (asked.get(item.id) ?? 0);
        const to: ItemStatus = distributed >= item.quantity ? 'distributed' : 'short';
        assertTransition('packing_unit_item', item.itemStatus, to);
        await tx.packingUnitItem.update({
          where: { id: item.id },
          data: { distributedQuantity: distributed, itemStatus: to },
        });
        await recordEvent(tx, {
          entityType: 'packing_unit_item', entityId: item.id, fromStatus: item.itemStatus, toStatus: to,
          actorId: actor.id, note,
        });
        if (to === 'short') {
          shortages.push(`${item.mappingReport.subCategory.description} (חסרים ${item.quantity - distributed})`);
        }
      }

      const to: PackingUnitStatus = shortages.length === 0 ? 'distributed' : 'distributed_short';
      assertTransition('packing_unit', unit.status, to);
      await tx.packingUnit.update({ where: { id: unit.id }, data: { status: to } });
      await recordEvent(tx, {
        entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: to,
        actorId: actor.id, note,
      });

      if (shortages.length > 0) {
        await notify(tx, {
          entityType: 'packing_unit',
          entityId: unit.id,
          body:
            `אריזה ${unit.code} פוזרה עם חוסר — יעד ${unit.destBuilding} / ${unit.destFloor} / ${unit.destRoom}, ` +
            `חוסרים: ${shortages.join(', ')}`,
        });
      }

      return loadPackingUnitDTO(tx, unit.id);
    },
    { timeout: 15_000 },
  );
}
