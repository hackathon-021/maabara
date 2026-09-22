import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  distributePackingUnit, getPackingUnitByCode, listPackableItems, receiveTransportUnit,
} from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, DEFAULT_DEST, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('the full evacuation chain', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  it('packs a room empty, loses one box in transit and distributes the other short', async () => {
    // 1. Pack: two boxes empty room A.
    const boxA = await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    const boxB = await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }] });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('closed');
    expect(await listPackableItems(fx.roomB)).toHaveLength(1); // room B is untouched

    // 2. Load: both boxes leave on one truck.
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [boxA.code!, boxB.code!] });
    expect(truck.status).toBe('in_transit');

    // 3. Receive: only box A comes off. Box B is missing, not forgotten.
    const received = await receiveTransportUnit(actor, truck.id, { receivedCodes: [boxA.code!], surplusCodes: [] });
    expect(received.missingCodes).toEqual([boxB.code]);
    expect((await getPackingUnitByCode(boxB.code!)).status).toBe('missing');

    // 4. Distribute: box A is handed over one laptop short.
    const toDistribute = await getPackingUnitByCode(boxA.code!);
    const distributed = await distributePackingUnit(actor, toDistribute.id, {
      items: [{ packingUnitItemId: toDistribute.items[0].id, quantity: 1 }],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(distributed.status).toBe('distributed_short');
    expect(distributed.items[0]).toMatchObject({ itemStatus: 'short', distributedQuantity: 1 });

    // 5. Nothing is lost silently: every box ends in an explicit terminal status...
    const finalStatuses = (await db.packingUnit.findMany({ orderBy: { id: 'asc' } })).map((u) => u.status);
    expect(finalStatuses).toEqual(['distributed_short', 'missing']);

    // ...every item too...
    const itemStatuses = (await db.packingUnitItem.findMany({ orderBy: { id: 'asc' } })).map((i) => i.itemStatus);
    expect(itemStatuses.sort()).toEqual(['missing', 'short']);

    // ...and the commander can replay box B's whole life from the audit trail.
    const boxBEvents = await db.statusEvent.findMany({
      where: { entityType: 'packing_unit', entityId: (await getPackingUnitByCode(boxB.code!)).id },
      orderBy: { id: 'asc' },
    });
    expect(boxBEvents.map((e) => e.toStatus)).toEqual(['open', 'closed', 'in_transit', 'missing']);
    expect(boxBEvents.every((e) => e.actorId === fx.userId)).toBe(true);

    // 6. Three SMS rows reached the dashboard feed: loaded, released-with-a-missing-box, short.
    const sms = await db.notification.findMany({ orderBy: { id: 'asc' } });
    expect(sms).toHaveLength(3);
    expect(sms[0].body).toContain('הועמסה');
    expect(sms[1].body).toContain(boxB.code!);
    expect(sms[2].body).toContain('פוזרה עם חוסר');
  });

  it('carries a personal carton through the chain without items', async () => {
    const personal = await packBox(actor, { roomId: fx.roomA, type: 'personal_carton' });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [personal.code!] });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [personal.code!], surplusCodes: [] });
    const done = await distributePackingUnit(actor, personal.id, { items: [], atRoom: DEFAULT_DEST.destRoom });

    expect(done.status).toBe('distributed');
    expect(await db.packingUnitItem.count()).toBe(0);
    // A personal carton never touches its source room's status — it doesn't even flip it to
    // 'packing', or a room with nothing but personal cartons would never leave that state.
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('done');
  });
});
