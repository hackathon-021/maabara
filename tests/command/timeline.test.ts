import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getTimeline, timelineLabel } from '@/lib/timeline';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeEvent, makeTruck } from './helpers';

describe('timelineLabel', () => {
  it('names a box by its code and its status in Hebrew', () => {
    expect(timelineLabel('packing_unit', 'missing', '10002')).toBe('אריזה 10002: אריזה חסרה');
  });

  // The shape the frozen contract documents.
  it('quotes an item by name', () => {
    expect(timelineLabel('packing_unit_item', 'packed', 'מחשב נייד')).toBe('פריט "מחשב נייד": פריט נארז');
  });

  it('names a transport unit by its plate', () => {
    expect(timelineLabel('transport_unit', 'released', '12-345-67')).toBe(
      'יחידת הובלה 12-345-67: יחידת הובלה שוחררה',
    );
  });

  it('reads the transport pseudo-status that only statusLabel knows about', () => {
    expect(timelineLabel('transport_unit', 'unloaded', '12-345-67')).toContain('נפרקה במלואה');
  });
});

describe('getTimeline', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('refuses a box that does not exist', async () => {
    await expect(getTimeline(9999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns nothing for a box with no events yet', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'open' });
    expect(await getTimeline(boxId)).toEqual([]);
  });

  it('tells the box story, its items and its truck, oldest first', async () => {
    const truckId = await makeTruck(fx, { status: 'released', licensePlate: '12-345-67' });
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'missing',
      code: '10002',
      transportUnitId: truckId,
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'missing' }],
    });
    const itemId = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } })).id;

    await makeEvent({ entityType: 'packing_unit', entityId: boxId, fromStatus: null, toStatus: 'open', actorId: fx.userId, at: new Date(2026, 8, 22, 10, 0) });
    await makeEvent({ entityType: 'packing_unit_item', entityId: itemId, fromStatus: null, toStatus: 'packed', actorId: fx.userId, at: new Date(2026, 8, 22, 11, 0) });
    await makeEvent({ entityType: 'transport_unit', entityId: truckId, fromStatus: 'loading', toStatus: 'in_transit', actorId: fx.userId, at: new Date(2026, 8, 22, 12, 0) });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, fromStatus: 'in_transit', toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 13, 0) });

    const timeline = await getTimeline(boxId);
    expect(timeline.map((e) => e.label)).toEqual([
      'אריזה 10002: אריזה בתהליך',
      'פריט "מחשב נייד": פריט נארז',
      'יחידת הובלה 12-345-67: יחידת הובלה בדרך',
      'אריזה 10002: אריזה חסרה',
    ]);
    expect(timeline[3]).toMatchObject({ entityType: 'packing_unit', fromStatus: 'in_transit', toStatus: 'missing' });
    expect(timeline[0].actorName).toBeTruthy();
  });

  it('leaves another box events out of this box story', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'closed', code: '10001' });
    const otherId = await makeBox(fx, { roomId: fx.roomA, status: 'closed', code: '10002' });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'closed', actorId: fx.userId });
    await makeEvent({ entityType: 'packing_unit', entityId: otherId, toStatus: 'closed', actorId: fx.userId });
    expect(await getTimeline(boxId)).toHaveLength(1);
  });

  // A close writes the box event and the item events inside one transaction, at one timestamp.
  it('orders events written at the same instant by insertion, not at random', async () => {
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }],
    });
    const itemId = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } })).id;
    const at = new Date(2026, 8, 22, 12, 0);
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'closed', actorId: fx.userId, at });
    await makeEvent({ entityType: 'packing_unit_item', entityId: itemId, toStatus: 'packed', actorId: fx.userId, at });

    const ids = (await getTimeline(boxId)).map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  // Review Focus 5: a box gets its code at close, so its earlier events have none.
  it('labels a box that has no code yet without printing null', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'open', code: null });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'open', actorId: fx.userId });
    expect((await getTimeline(boxId))[0].label).toBe(`אריזה #${boxId}: אריזה בתהליך`);
  });

  it('carries the note a lifecycle action left behind', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'received', code: '10001' });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'received', actorId: fx.userId, note: 'עודף' });
    expect((await getTimeline(boxId))[0].note).toBe('עודף');
  });
});
