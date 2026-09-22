import { beforeEach, describe, expect, it } from 'vitest';
import { dashboardExceptions, dashboardNotifications, getDashboard } from '@/lib/dashboard';
import { db } from '@/lib/db';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeEvent, makeNotification, makeTruck } from './helpers';

describe('dashboardExceptions', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('is empty when nothing has been lost', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'received',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'received' }],
    });
    expect(await dashboardExceptions()).toEqual([]);
  });

  it('reports a missing box with the last actor and time from its events', async () => {
    const at = new Date(2026, 8, 22, 16, 30);
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'missing',
      code: '10002',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'missing' }],
    });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'missing', actorId: fx.userId, at });

    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({
      kind: 'missing_box',
      packingUnitId: boxId,
      packingUnitCode: '10002',
      at: at.toISOString(),
    });
    expect(exception.description).toContain('10002');
    expect(exception.lastActorName).toBeTruthy();
  });

  it('reports a short item with how much of it arrived', async () => {
    const at = new Date(2026, 8, 22, 17, 0);
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'distributed_short',
      code: '10003',
      items: [
        { mappingReportId: fx.reports.laptop, quantity: 2, distributedQuantity: 1, itemStatus: 'short' },
      ],
    });
    // The item's own event is what the panel attributes the shortage to.
    const item = await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } });
    await makeEvent({ entityType: 'packing_unit_item', entityId: item.id, toStatus: 'short', actorId: fx.userId, at });

    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({
      kind: 'short_item',
      packingUnitId: boxId,
      packingUnitCode: '10003',
      at: at.toISOString(),
    });
    expect(exception.description).toBe('מחשב נייד: פוזרו 1 מתוך 2');
  });

  // Review Focus 4.
  it('still lists a missing box that has no status event behind it', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10004' });
    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({ kind: 'missing_box', packingUnitId: boxId, lastActorName: '—' });
    expect(exception.at).toBeTruthy();
    expect(Number.isNaN(Date.parse(exception.at))).toBe(false);
  });

  it('uses the most recent event when a box has several', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10005' });
    await makeEvent({
      entityType: 'packing_unit',
      entityId: boxId,
      toStatus: 'in_transit',
      actorId: fx.userId,
      at: new Date(2026, 8, 22, 14, 0),
    });
    await makeEvent({
      entityType: 'packing_unit',
      entityId: boxId,
      toStatus: 'missing',
      actorId: fx.userId,
      at: new Date(2026, 8, 22, 16, 0),
    });
    expect((await dashboardExceptions())[0].at).toBe(new Date(2026, 8, 22, 16, 0).toISOString());
  });

  it('puts the newest exception first', async () => {
    const older = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10006' });
    const newer = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10007' });
    await makeEvent({ entityType: 'packing_unit', entityId: older, toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 10, 0) });
    await makeEvent({ entityType: 'packing_unit', entityId: newer, toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 18, 0) });
    expect((await dashboardExceptions()).map((e) => e.packingUnitCode)).toEqual(['10007', '10006']);
  });
});

describe('dashboardNotifications', () => {
  beforeEach(async () => {
    await resetDb();
    await seedFixture();
  });

  it('is empty before anything has been sent', async () => {
    expect(await dashboardNotifications()).toEqual([]);
  });

  it('returns the feed newest first', async () => {
    await makeNotification('יחידת הובלה הועמסה', new Date(2026, 8, 22, 14, 0));
    await makeNotification('יחידת הובלה שוחררה', new Date(2026, 8, 22, 17, 0));
    expect((await dashboardNotifications()).map((n) => n.body)).toEqual([
      'יחידת הובלה שוחררה',
      'יחידת הובלה הועמסה',
    ]);
  });
});

describe('getDashboard', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  // Review Focus 2: this is the very first thing anyone opens.
  it('answers on an untouched database', async () => {
    const d = await getDashboard();
    expect(d.kpis.packed).toBe(0);
    expect(d.rooms.length).toBeGreaterThan(0);
    expect(d.trucks).toEqual([]);
    expect(d.exceptions).toEqual([]);
    expect(d.notifications).toEqual([]);
    expect(Number.isNaN(Date.parse(d.generatedAt))).toBe(false);
  });

  it('carries every section of the DTO at once', async () => {
    const truckId = await makeTruck(fx, { status: 'in_transit', departedAt: new Date() });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      code: '10001',
      transportUnitId: truckId,
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeNotification('יחידת הובלה הועמסה');

    const d = await getDashboard();
    expect(d.kpis.inTransit).toBe(2);
    expect(d.boxCounts.in_transit).toBe(1);
    expect(d.trucks).toHaveLength(1);
    expect(d.notifications).toHaveLength(1);
  });
});
