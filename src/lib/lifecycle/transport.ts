import type { CreateTransportReq, LoadReq, TransportUnitDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import type { Actor } from '@/lib/session';
import { normalizeCode } from './dto';
import { formatHe, notify, recordEvent } from './events';
import { loadTransportUnitDTO } from './queries';
import { assertTransition } from './transitions';

export async function createTransportUnit(actor: Actor, req: CreateTransportReq): Promise<TransportUnitDTO> {
  return db.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: req.groupId } });
    if (!group) throw Errors.notFound('מדור');

    const truck = await tx.transportUnit.create({
      data: {
        type: req.type,
        typeDetails: req.typeDetails?.trim() || null,
        licensePlate: req.licensePlate.trim(),
        groupId: group.id,
        status: 'loading',
        createdById: actor.id,
      },
    });
    await recordEvent(tx, {
      entityType: 'transport_unit', entityId: truck.id, fromStatus: null, toStatus: 'loading', actorId: actor.id,
    });
    return loadTransportUnitDTO(tx, truck.id);
  });
}

/**
 * Attaches every scanned box to the truck and sends it on its way. One call per truck:
 * the truck departs here, so a second load on the same truck is rejected.
 * TODO: boxes are not checked against the truck's group — the demo never mixes groups.
 */
export async function loadTransportUnit(
  actor: Actor,
  transportUnitId: number,
  req: LoadReq,
): Promise<TransportUnitDTO> {
  return db.$transaction(
    async (tx) => {
      const truck = await tx.transportUnit.findUnique({ where: { id: transportUnitId } });
      if (!truck) throw Errors.notFound('יחידת הובלה');
      assertTransition('transport_unit', truck.status, 'in_transit');

      // The client accumulates raw scans, so the same box can arrive several times.
      const codes = [...new Set(req.codes.map(normalizeCode))];
      const units = await tx.packingUnit.findMany({ where: { code: { in: codes } } });
      const byCode = new Map(units.map((u) => [normalizeCode(u.code ?? ''), u]));

      // Validate everything before writing anything: a bad code must leave the truck untouched.
      for (const code of codes) {
        const unit = byCode.get(code);
        if (!unit) throw Errors.notFound(`אריזה ${code}`);
        assertTransition('packing_unit', unit.status, 'in_transit');
      }

      const departedAt = new Date();
      for (const code of codes) {
        const unit = byCode.get(code)!;
        await tx.packingUnit.update({
          where: { id: unit.id },
          data: { status: 'in_transit', transportUnitId: truck.id },
        });
        await recordEvent(tx, {
          entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'in_transit',
          actorId: actor.id, note: `הועמסה על ${truck.licensePlate}`,
        });
      }

      await tx.transportUnit.update({
        where: { id: truck.id },
        data: { status: 'in_transit', departedAt },
      });
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: truck.status, toStatus: 'in_transit',
        actorId: actor.id,
      });
      await notify(tx, {
        entityType: 'transport_unit',
        entityId: truck.id,
        body: `יחידת הובלה הועמסה — מס' רישוי ${truck.licensePlate}, ${codes.length} אריזות, ${formatHe(departedAt)}`,
      });

      return loadTransportUnitDTO(tx, truck.id);
    },
    { timeout: 15_000 },
  );
}
