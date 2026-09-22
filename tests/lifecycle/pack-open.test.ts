import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { openPackingUnit, setPackingUnitItems } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('open a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  it('opens a box, records the event and moves the room into packing', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' });
    expect(unit).toMatchObject({
      status: 'open',
      code: null,
      type: 'professional_carton',
      sourceRoomId: fx.roomA,
      sourceRoomName: 'חדר A',
      groupName: 'מדור בדיקות',
      packedByName: 'בודק',
      items: [],
    });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('packing');
    const events = await db.statusEvent.findMany({ orderBy: { id: 'asc' } });
    expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([
      ['packing_unit', null, 'open'],
      ['room', 'done', 'packing'],
    ]);
  });

  it('leaves the room alone when a second box opens', async () => {
    await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' });
    await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    expect(await db.statusEvent.count({ where: { entityType: 'room' } })).toBe(1);
  });

  it('refuses an unmapped room', async () => {
    await expect(
      openPackingUnit(actor, { sourceRoomId: fx.roomUnmapped, type: 'professional_carton' }),
    ).rejects.toMatchObject({ code: 'ROOM_NOT_MAPPED' });
    expect(await db.packingUnit.count()).toBe(0);
  });
});

describe('set packing unit items', () => {
  let fx: Fixture;
  let actor: Actor;
  let unitId: number;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    unitId = (await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' })).id;
  });

  it('stores the chosen items with their quantities, sorted A–Z', async () => {
    const unit = await setPackingUnitItems(actor, unitId, {
      items: [
        { mappingReportId: fx.reports.monitor, quantity: 1 },
        { mappingReportId: fx.reports.laptop, quantity: 2 },
      ],
    });
    expect(unit.items.map((i) => [i.name, i.quantity, i.itemStatus])).toEqual([
      ['מחשב נייד', 2, 'packed'],
      ['מסך', 1, 'packed'],
    ]);
  });

  it('writes no item events before the box closes', async () => {
    await setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] });
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit_item' } })).toBe(0);
  });

  it('replaces the contents on a second call without double-counting remaining', async () => {
    await setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    // Same box, same two laptops — this is an edit, not another two laptops.
    const unit = await setPackingUnitItems(actor, unitId, {
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    expect(unit.items).toHaveLength(1);
    expect(unit.items[0].quantity).toBe(2);
    expect(await db.packingUnitItem.count({ where: { packingUnitId: unitId } })).toBe(1);
  });

  it('rejects more than the room has left', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 3 }] }),
    ).rejects.toMatchObject({
      code: 'QUANTITY_EXCEEDS_REMAINING',
      messageHe: 'הכמות עבור "מחשב נייד" גדולה מהמותר (2)',
    });
  });

  it('counts what another box already took', async () => {
    const other = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    await setPackingUnitItems(actor, other.id, { items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'QUANTITY_EXCEEDS_REMAINING' });
  });

  it('rejects an item from another room and a disposal item', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.mappingReport.update({ where: { id: fx.reports.printer }, data: { roomId: fx.roomA } });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.printer, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects the same item twice in one request', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, {
        items: [
          { mappingReportId: fx.reports.laptop, quantity: 1 },
          { mappingReportId: fx.reports.laptop, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses items on a personal carton', async () => {
    const personal = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'personal_carton' });
    await expect(
      setPackingUnitItems(actor, personal.id, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION', messageHe: 'קרטון אישי אינו מכיל פריטים' });
  });

  it('refuses to edit a box that is no longer open', async () => {
    await db.packingUnit.update({ where: { id: unitId }, data: { status: 'closed', code: '10001' } });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
