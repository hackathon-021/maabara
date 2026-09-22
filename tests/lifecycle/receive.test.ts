import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTransportUnit, loadTransportUnit, receiveTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('receive a transport unit', () => {
  let fx: Fixture;
  let actor: Actor;
  let truckId: number;
  let codeA: string;
  let codeB: string;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    codeA = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] })).code!;
    codeB = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }] })).code!;
    truckId = (await loadTruck(actor, { groupId: fx.groupId, codes: [codeA, codeB] })).id;
  });

  it('receives every box, releases the truck and writes the unloaded event', async () => {
    const result = await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, codeB], surplusCodes: [] });

    expect(result.receivedCodes).toEqual([codeA, codeB].sort());
    expect(result.missingCodes).toEqual([]);
    expect(result.surplusCodes).toEqual([]);
    expect(result.transportUnit.status).toBe('released');
    expect(result.transportUnit.releasedAt).not.toBeNull();
    expect(result.transportUnit.boxes.every((b) => b.status === 'received')).toBe(true);

    const truckEvents = await db.statusEvent.findMany({
      where: { entityType: 'transport_unit', entityId: truckId }, orderBy: { id: 'asc' },
    });
    expect(truckEvents.map((e) => e.toStatus)).toEqual(['loading', 'in_transit', 'unloaded', 'released']);
    expect((await db.packingUnitItem.findMany()).every((i) => i.itemStatus === 'received')).toBe(true);
  });

  it('marks an unconfirmed box and its items missing', async () => {
    const result = await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA], surplusCodes: [] });

    expect(result.receivedCodes).toEqual([codeA]);
    expect(result.missingCodes).toEqual([codeB]);
    const missing = await db.packingUnit.findFirstOrThrow({ where: { code: codeB }, include: { items: true } });
    expect(missing.status).toBe('missing');
    expect(missing.items.map((i) => i.itemStatus)).toEqual(['missing']);
    const itemEvent = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit_item', toStatus: 'missing' },
    });
    expect(itemEvent.fromStatus).toBe('packed');
  });

  it('names the missing boxes in the SMS', async () => {
    await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA], surplusCodes: [] });
    const sms = await db.notification.findMany({ orderBy: { id: 'asc' } });
    expect(sms).toHaveLength(2); // one from the load, one from the receive
    expect(sms[1].body).toContain('יחידת הובלה שוחררה');
    expect(sms[1].body).toContain(codeB);
  });

  it('accepts a confirmed surplus box from another truck and attaches it', async () => {
    const codeC = (await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] })).code!;
    const other = await createTransportUnit(actor, { type: 'truck', licensePlate: '99-888-77', groupId: fx.groupId });
    await loadTransportUnit(actor, other.id, { codes: [codeC] });

    const result = await receiveTransportUnit(actor, truckId, {
      receivedCodes: [codeA, codeB],
      surplusCodes: [codeC],
    });
    expect(result.surplusCodes).toEqual([codeC]);
    const surplus = await db.packingUnit.findFirstOrThrow({ where: { code: codeC } });
    expect(surplus.status).toBe('received');
    expect(surplus.transportUnitId).toBe(truckId);
    const event = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit', entityId: surplus.id, toStatus: 'received' },
    });
    expect(event.note).toContain('עודף');
  });

  it('rejects a code that is neither on the truck nor confirmed as surplus', async () => {
    const stray = (await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] })).code!;
    await expect(
      receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, stray], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'NOT_ON_THIS_TRUCK', status: 409 });
    expect((await db.transportUnit.findUniqueOrThrow({ where: { id: truckId } })).status).toBe('in_transit');
  });

  it('processes a code exactly once when it is listed twice or in both lists', async () => {
    const result = await receiveTransportUnit(actor, truckId, {
      receivedCodes: [codeA, codeA, codeB],
      surplusCodes: [codeB],
    });
    expect(result.receivedCodes).toEqual([codeA, codeB].sort());
    expect(result.surplusCodes).toEqual([]);
    expect(result.missingCodes).toEqual([]);
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit', toStatus: 'received' } })).toBe(2);
  });

  it('refuses a truck that has not departed and one already released', async () => {
    const loading = await createTransportUnit(actor, { type: 'truck', licensePlate: '11-111-11', groupId: fx.groupId });
    await expect(
      receiveTransportUnit(actor, loading.id, { receivedCodes: [], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, codeB], surplusCodes: [] });
    await expect(
      receiveTransportUnit(actor, truckId, { receivedCodes: [], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
