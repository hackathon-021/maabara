import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getPackingUnitByCode, listPackableItems, listPackingUnits } from '@/lib/lifecycle';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('read models', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('lists transfer and salvage items of a mapped room, sorted A–Z, with remaining', async () => {
    const items = await listPackableItems(fx.roomA);
    expect(items.map((i) => i.name)).toEqual(['מחשב נייד', 'מסך']);
    expect(items).toEqual([
      { mappingReportId: fx.reports.laptop, name: 'מחשב נייד', serial: null, status: 'transfer', remaining: 2 },
      { mappingReportId: fx.reports.monitor, name: 'מסך', serial: null, status: 'salvage', remaining: 1 },
    ]);
  });

  it('never offers a disposal item', async () => {
    const items = await listPackableItems(fx.roomB);
    expect(items.map((i) => i.mappingReportId)).toEqual([fx.reports.chair]);
  });

  it('subtracts what is already in a box, including a box still open', async () => {
    const unit = await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'open', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    await db.packingUnitItem.create({
      data: { packingUnitId: unit.id, mappingReportId: fx.reports.laptop, quantity: 1 },
    });
    const items = await listPackableItems(fx.roomA);
    expect(items.find((i) => i.mappingReportId === fx.reports.laptop)?.remaining).toBe(1);
  });

  it('drops an item once nothing remains', async () => {
    const unit = await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'open', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    await db.packingUnitItem.create({
      data: { packingUnitId: unit.id, mappingReportId: fx.reports.laptop, quantity: 2 },
    });
    expect((await listPackableItems(fx.roomA)).map((i) => i.name)).toEqual(['מסך']);
  });

  it('refuses a room that is still being mapped', async () => {
    await expect(listPackableItems(fx.roomUnmapped)).rejects.toMatchObject({
      code: 'ROOM_NOT_MAPPED',
      messageHe: 'יש לסיים את המיפוי',
      status: 409,
    });
  });

  it('refuses a room that is already closed', async () => {
    await db.room.update({ where: { id: fx.roomA }, data: { status: 'closed' } });
    await expect(listPackableItems(fx.roomA)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('reports a missing room as NOT_FOUND', async () => {
    await expect(listPackableItems(999_999)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('filters the box list by status and by room', async () => {
    const make = (roomId: number, status: string, code: string) =>
      db.packingUnit.create({
        data: { type: 'professional_carton', status, code, sourceRoomId: roomId, packedById: fx.userId },
      });
    await make(fx.roomA, 'closed', '10001');
    await make(fx.roomA, 'in_transit', '10002');
    await make(fx.roomB, 'closed', '10003');

    expect((await listPackingUnits({ status: 'closed' })).map((u) => u.code)).toEqual(['10001', '10003']);
    expect((await listPackingUnits({ roomId: fx.roomB })).map((u) => u.code)).toEqual(['10003']);
    expect(await listPackingUnits({})).toHaveLength(3);
  });

  it('finds a box by code, tolerating scanner whitespace', async () => {
    await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'closed', code: '10007', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    const unit = await getPackingUnitByCode(' 10007 ');
    expect(unit.code).toBe('10007');
    expect(unit.sourceRoomName).toBe('חדר A');
    expect(unit.groupName).toBe('מדור בדיקות');
  });

  it('reports an unknown code as NOT_FOUND, not a crash', async () => {
    await expect(getPackingUnitByCode('99999')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
