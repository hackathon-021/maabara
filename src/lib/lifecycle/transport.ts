import type { CreateTransportReq, ItemStatus, LoadReq, ReceiveReq, ReceiveResult, TransportUnitDTO } from '@/lib/contracts';
import { db, type Tx } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';
import type { Actor } from '@/lib/session';
import { normalizeCode } from './dto';
import { formatHe, notify, recordEvent } from './events';
import { loadTransportUnitDTO } from './queries';
import { assertTransition, PACKING_UNIT_TRANSITIONS, TRANSPORT_UNLOADED } from './transitions';

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
      // Illegal-transition codes are collected and reported together — with 20 boxes in one scan
      // batch, "cannot move from X to Y" alone doesn't tell the operator which box to remove.
      const badCodes: string[] = [];
      for (const code of codes) {
        const unit = byCode.get(code);
        if (!unit) throw Errors.notFound(`אריזה ${code}`);
        const allowed: readonly string[] | undefined = (
          PACKING_UNIT_TRANSITIONS as Record<string, readonly string[]>
        )[unit.status];
        if (!allowed?.includes('in_transit')) badCodes.push(code);
      }
      if (badCodes.length > 0) throw Errors.validation(`אריזות שלא ניתן להעמיס: ${badCodes.join(', ')}`);

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

const SURPLUS_NOTE = 'עודף — התקבלה למרות שלא הועמסה על יחידת הובלה זו';

/** Moves every item of a box to the same status as the box, each with its own event. */
async function setItemsStatus(
  tx: Tx,
  actor: Actor,
  packingUnitId: number,
  to: ItemStatus,
  note?: string,
): Promise<void> {
  const items = await tx.packingUnitItem.findMany({ where: { packingUnitId } });
  for (const item of items) {
    assertTransition('packing_unit_item', item.itemStatus, to);
    await tx.packingUnitItem.update({ where: { id: item.id }, data: { itemStatus: to } });
    await recordEvent(tx, {
      entityType: 'packing_unit_item', entityId: item.id, fromStatus: item.itemStatus, toStatus: to,
      actorId: actor.id, note,
    });
  }
}

async function markBox(
  tx: Tx,
  actor: Actor,
  unit: { id: number; status: string },
  to: 'received' | 'missing',
  note?: string,
  attachToTruckId?: number,
): Promise<void> {
  assertTransition('packing_unit', unit.status, to);
  await tx.packingUnit.update({
    where: { id: unit.id },
    data: { status: to, ...(attachToTruckId === undefined ? {} : { transportUnitId: attachToTruckId }) },
  });
  await recordEvent(tx, {
    entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: to, actorId: actor.id, note,
  });
  await setItemsStatus(tx, actor, unit.id, to === 'received' ? 'received' : 'missing', note);
}

/**
 * A surplus box was found physically on this truck, so the scan itself is the evidence — the box
 * demonstrably travelled even if the normal packing_unit transition table never saw it leave.
 * `closed` (never loaded, e.g. found after `loadTransportUnit`'s one-shot submit already ran) and
 * `missing` (unconfirmed on an earlier truck's unload — spec §4 addendum) are both accepted; any
 * other status is a scanning mistake, not a surplus box, and must not roll back the rest of the
 * unload, so it is reported by name instead of thrown as a generic illegal-transition error.
 */
const SURPLUS_RECEIVABLE_STATUSES: readonly string[] = ['in_transit', 'closed', 'missing'];

async function markSurplusReceived(
  tx: Tx,
  actor: Actor,
  foreign: { id: number; status: string; code: string | null },
  truckId: number,
): Promise<void> {
  if (!SURPLUS_RECEIVABLE_STATUSES.includes(foreign.status)) {
    throw Errors.validation(
      `אריזה ${foreign.code} בסטטוס "${statusLabel('packing_unit', foreign.status)}" — לא ניתן לקבלה כעודף`,
    );
  }
  await tx.packingUnit.update({
    where: { id: foreign.id },
    data: { status: 'received', transportUnitId: truckId },
  });
  await recordEvent(tx, {
    entityType: 'packing_unit', entityId: foreign.id, fromStatus: foreign.status, toStatus: 'received',
    actorId: actor.id, note: SURPLUS_NOTE,
  });
  const items = await tx.packingUnitItem.findMany({ where: { packingUnitId: foreign.id } });
  for (const item of items) {
    await tx.packingUnitItem.update({ where: { id: item.id }, data: { itemStatus: 'received' } });
    await recordEvent(tx, {
      entityType: 'packing_unit_item', entityId: item.id, fromStatus: item.itemStatus, toStatus: 'received',
      actorId: actor.id, note: SURPLUS_NOTE,
    });
  }
}

/**
 * Spec §5.3. Sent once with the final set of codes. Anything loaded on this truck that the
 * unloader did not confirm becomes `missing` — never silently dropped (spec §3 invariant 3).
 */
export async function receiveTransportUnit(
  actor: Actor,
  transportUnitId: number,
  req: ReceiveReq,
): Promise<ReceiveResult> {
  return db.$transaction(
    async (tx) => {
      const truck = await tx.transportUnit.findUnique({
        where: { id: transportUnitId },
        include: { packingUnits: true },
      });
      if (!truck) throw Errors.notFound('יחידת הובלה');
      assertTransition('transport_unit', truck.status, TRANSPORT_UNLOADED);

      const onTruck = new Map(
        truck.packingUnits.filter((u) => u.code !== null).map((u) => [normalizeCode(u.code!), u]),
      );
      const surplusSet = new Set(req.surplusCodes.map(normalizeCode));
      // One set for both lists: a code listed twice, or in both lists, is handled exactly once.
      const confirmed = new Set([...req.receivedCodes, ...req.surplusCodes].map(normalizeCode));

      const receivedCodes: string[] = [];
      const surplusCodes: string[] = [];
      for (const code of confirmed) {
        const unit = onTruck.get(code);
        if (unit) {
          // A code the unloader flagged as surplus that IS on this truck is a normal receive.
          await markBox(tx, actor, unit, 'received');
          receivedCodes.push(code);
          continue;
        }
        if (!surplusSet.has(code)) throw Errors.notOnThisTruck(code);
        const foreign = await tx.packingUnit.findUnique({ where: { code } });
        if (!foreign) throw Errors.notFound(`אריזה ${code}`);
        await markSurplusReceived(tx, actor, foreign, truck.id);
        surplusCodes.push(code);
      }

      const missingCodes: string[] = [];
      for (const [code, unit] of onTruck) {
        if (confirmed.has(code)) continue;
        await markBox(tx, actor, unit, 'missing', `לא נפרקה מ${truck.licensePlate}`);
        missingCodes.push(code);
      }

      const releasedAt = new Date();
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: truck.status, toStatus: TRANSPORT_UNLOADED,
        actorId: actor.id,
      });
      assertTransition('transport_unit', TRANSPORT_UNLOADED, 'released');
      await tx.transportUnit.update({ where: { id: truck.id }, data: { status: 'released', releasedAt } });
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: TRANSPORT_UNLOADED, toStatus: 'released',
        actorId: actor.id,
      });

      const missingText = missingCodes.length === 0 ? 'ללא חוסרים' : `אריזות חסרות: ${missingCodes.join(', ')}`;
      await notify(tx, {
        entityType: 'transport_unit',
        entityId: truck.id,
        body:
          `יחידת הובלה שוחררה — מס' רישוי ${truck.licensePlate}, ` +
          `התקבלו ${receivedCodes.length + surplusCodes.length} אריזות, ${missingText}, ${formatHe(releasedAt)}`,
      });

      return {
        transportUnit: await loadTransportUnitDTO(tx, truck.id),
        receivedCodes: receivedCodes.sort(),
        missingCodes: missingCodes.sort(),
        surplusCodes: surplusCodes.sort(),
      };
    },
    { timeout: 15_000 },
  );
}
