import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { distributePackingUnit, getPackingUnitByCode, receiveTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, DEFAULT_DEST, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('distribute a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  let unitId: number;
  let laptopItemId: number;
  let monitorItemId: number;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    const box = await packBox(actor, {
      roomId: fx.roomA,
      items: [
        { mappingReportId: fx.reports.laptop, quantity: 2 },
        { mappingReportId: fx.reports.monitor, quantity: 1 },
      ],
    });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [box.code!] });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [box.code!], surplusCodes: [] });
    const received = await getPackingUnitByCode(box.code!);
    unitId = received.id;
    laptopItemId = received.items.find((i) => i.name === 'מחשב נייד')!.id;
    monitorItemId = received.items.find((i) => i.name === 'מסך')!.id;
  });

  it('marks the box distributed when everything is handed over', async () => {
    const unit = await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 2 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(unit.status).toBe('distributed');
    expect(unit.items.every((i) => i.itemStatus === 'distributed')).toBe(true);
    expect(unit.items.map((i) => i.distributedQuantity)).toEqual([2, 1]);
    expect(await db.notification.count({ where: { entityType: 'packing_unit' } })).toBe(0);
  });

  it('marks a partial hand-over short, on the box and on the item, with an SMS', async () => {
    const unit = await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 1 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(unit.status).toBe('distributed_short');
    const laptop = unit.items.find((i) => i.id === laptopItemId)!;
    expect(laptop).toMatchObject({ itemStatus: 'short', distributedQuantity: 1 });
    expect(unit.items.find((i) => i.id === monitorItemId)!.itemStatus).toBe('distributed');

    const sms = await db.notification.findFirstOrThrow({ where: { entityType: 'packing_unit' } });
    expect(sms.body).toContain('פוזרה עם חוסר');
    expect(sms.body).toContain('מחשב נייד');
  });

  it('marks everything short when nothing is handed over', async () => {
    const unit = await distributePackingUnit(actor, unitId, { items: [], atRoom: DEFAULT_DEST.destRoom });
    expect(unit.status).toBe('distributed_short');
    expect(unit.items.every((i) => i.itemStatus === 'short')).toBe(true);
    expect(unit.items.every((i) => i.distributedQuantity === 0)).toBe(true);
    expect(await db.notification.count({ where: { entityType: 'packing_unit' } })).toBe(1);
  });

  it('records a wrong-room override in the event note', async () => {
    await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 2 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: 'חדר 999',
    });
    const event = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit', entityId: unitId, toStatus: 'distributed' },
    });
    expect(event.note).toContain('חדר 999');
    expect(event.note).toContain(DEFAULT_DEST.destRoom);
  });

  it('rejects more than the box holds', async () => {
    await expect(
      distributePackingUnit(actor, unitId, {
        items: [{ packingUnitItemId: laptopItemId, quantity: 3 }],
        atRoom: DEFAULT_DEST.destRoom,
      }),
    ).rejects.toMatchObject({
      code: 'QUANTITY_EXCEEDS_REMAINING',
      messageHe: 'הכמות עבור "מחשב נייד" גדולה מהמותר (2)',
    });
    expect((await db.packingUnit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('received');
  });

  it('rejects an item from another box', async () => {
    const other = await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] });
    const strayItem = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: other.id } })).id;
    await expect(
      distributePackingUnit(actor, unitId, {
        items: [{ packingUnitItemId: strayItem, quantity: 1 }],
        atRoom: DEFAULT_DEST.destRoom,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a box that was never received', async () => {
    const closed = await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] });
    await expect(
      distributePackingUnit(actor, closed.id, { items: [], atRoom: 'חדר 214' }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('takes a personal carton straight to distributed', async () => {
    // roomA is fully consumed (and auto-closed) by the beforeEach box, so packing a second box
    // there would hit an unrelated ROOM_NOT_MAPPED/ILLEGAL_TRANSITION from pack.ts's room check.
    // roomB still has unpacked equipment, so it isolates this test to distribute behavior.
    const personal = await packBox(actor, { roomId: fx.roomB, type: 'personal_carton' });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [personal.code!], licensePlate: '77-777-77' });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [personal.code!], surplusCodes: [] });
    const unit = await distributePackingUnit(actor, personal.id, { items: [], atRoom: DEFAULT_DEST.destRoom });
    expect(unit.status).toBe('distributed');
    expect(unit.items).toEqual([]);
  });
});
