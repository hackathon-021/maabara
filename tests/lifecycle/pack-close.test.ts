import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { closePackingUnit, openPackingUnit, setPackingUnitItems } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

const DEST = { destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' };

describe('close a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  async function openWith(roomId: number, items: { mappingReportId: number; quantity: number }[]) {
    const unit = await openPackingUnit(actor, { sourceRoomId: roomId, type: 'professional_carton' });
    await setPackingUnitItems(actor, unit.id, { items });
    return unit.id;
  }

  it('assigns a 5-digit code, stores the destination and marks the items packed', async () => {
    const id = await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]);
    const { unit, roomCheck } = await closePackingUnit(actor, id, DEST);

    expect(unit.code).toMatch(/^\d{5}$/);
    expect(unit).toMatchObject({ status: 'closed', destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' });
    expect(unit.closedAt).not.toBeNull();
    expect(unit.items.map((i) => i.itemStatus)).toEqual(['packed']);
    expect(roomCheck).toEqual({ remaining: 2, disposalRemaining: 0, roomStatus: 'packing' });

    const itemEvents = await db.statusEvent.findMany({ where: { entityType: 'packing_unit_item' } });
    expect(itemEvents.map((e) => [e.fromStatus, e.toStatus])).toEqual([[null, 'packed']]);
  });

  it('hands out codes in ascending order, each unique', async () => {
    const a = await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]), DEST);
    const b = await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.monitor, quantity: 1 }]), DEST);
    expect(a.unit.code).toBe('10001');
    expect(b.unit.code).toBe('10002');
  });

  it('closes the room once nothing transferable is left', async () => {
    await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 2 }]), DEST);
    const { roomCheck } = await closePackingUnit(
      actor,
      await openWith(fx.roomA, [{ mappingReportId: fx.reports.monitor, quantity: 1 }]),
      DEST,
    );
    expect(roomCheck).toEqual({ remaining: 0, disposalRemaining: 0, roomStatus: 'closed' });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('closed');
    const roomEvents = await db.statusEvent.findMany({ where: { entityType: 'room', entityId: fx.roomA } });
    expect(roomEvents.map((e) => e.toStatus)).toEqual(['packing', 'closed']);
  });

  it('sends a room with leftover disposal items to awaiting_disposal', async () => {
    const { roomCheck } = await closePackingUnit(
      actor,
      await openWith(fx.roomB, [{ mappingReportId: fx.reports.chair, quantity: 1 }]),
      DEST,
    );
    expect(roomCheck).toEqual({ remaining: 0, disposalRemaining: 1, roomStatus: 'awaiting_disposal' });
  });

  it('skips the room check for a personal carton', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'personal_carton' });
    const { unit: closed, roomCheck } = await closePackingUnit(actor, unit.id, DEST);
    expect(roomCheck).toBeNull();
    expect(closed.code).toMatch(/^\d{5}$/);
    expect(closed.items).toEqual([]);
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('packing');
  });

  it('refuses to close an empty non-personal box', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    await expect(closePackingUnit(actor, unit.id, DEST)).rejects.toMatchObject({
      code: 'VALIDATION',
      messageHe: 'יש לבחור פריטים לאריזה',
    });
    expect((await db.packingUnit.findUniqueOrThrow({ where: { id: unit.id } })).code).toBeNull();
  });

  it('refuses to close the same box twice', async () => {
    const id = await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]);
    await closePackingUnit(actor, id, DEST);
    await expect(closePackingUnit(actor, id, DEST)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
