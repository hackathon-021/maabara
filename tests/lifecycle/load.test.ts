import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTransportUnit, listTransportUnits, loadTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('load a transport unit', () => {
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
    truckId = (await createTransportUnit(actor, { type: 'truck', licensePlate: '12-345-67', groupId: fx.groupId })).id;
  });

  it('creates a truck in loading with its own event', async () => {
    const truck = await db.transportUnit.findUniqueOrThrow({ where: { id: truckId } });
    expect(truck).toMatchObject({ status: 'loading', licensePlate: '12-345-67', departedAt: null });
    expect(await db.statusEvent.count({ where: { entityType: 'transport_unit', toStatus: 'loading' } })).toBe(1);
  });

  it('moves every scanned box and the truck to in_transit and sends one SMS', async () => {
    const truck = await loadTransportUnit(actor, truckId, { codes: [codeA, codeB] });

    expect(truck.status).toBe('in_transit');
    expect(truck.departedAt).not.toBeNull();
    expect(truck.boxes.map((b) => b.code)).toEqual([codeA, codeB].sort());
    expect(truck.boxes.every((b) => b.status === 'in_transit')).toBe(true);

    const boxEvents = await db.statusEvent.findMany({ where: { entityType: 'packing_unit', toStatus: 'in_transit' } });
    expect(boxEvents).toHaveLength(2);
    expect(boxEvents[0].note).toContain('12-345-67');

    const sms = await db.notification.findMany();
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain('יחידת הובלה הועמסה');
    expect(sms[0].body).toContain('12-345-67');
    expect(sms[0].body).toContain('2 אריזות');
  });

  it('treats a box scanned twice in one load as one box', async () => {
    const truck = await loadTransportUnit(actor, truckId, { codes: [codeA, codeA, ' ' + codeA + ' '] });
    expect(truck.boxes).toHaveLength(1);
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit', toStatus: 'in_transit' } })).toBe(1);
    expect((await db.notification.findFirstOrThrow()).body).toContain('1 אריזות');
  });

  it('rejects an unknown code and changes nothing', async () => {
    await expect(loadTransportUnit(actor, truckId, { codes: [codeA, '99999'] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    expect(await db.packingUnit.count({ where: { status: 'in_transit' } })).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it('rejects a box that is already on another truck, names it in the message, and changes nothing', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    const second = await createTransportUnit(actor, { type: 'truck', licensePlate: '99-888-77', groupId: fx.groupId });
    await expect(loadTransportUnit(actor, second.id, { codes: [codeA, codeB] })).rejects.toMatchObject({
      code: 'VALIDATION',
      messageHe: expect.stringContaining(codeA),
    });
    expect((await db.packingUnit.findFirstOrThrow({ where: { code: codeB } })).status).toBe('closed');
  });

  it('rejects loading a truck that already departed', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    await expect(loadTransportUnit(actor, truckId, { codes: [codeB] })).rejects.toMatchObject({
      code: 'ILLEGAL_TRANSITION',
    });
  });

  it('lists trucks by status for the receiving screen', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    await createTransportUnit(actor, { type: 'other', typeDetails: 'רכב פרטי', licensePlate: '55-555-55', groupId: fx.groupId });
    expect((await listTransportUnits('in_transit')).map((t) => t.id)).toEqual([truckId]);
    expect(await listTransportUnits('loading')).toHaveLength(1);
    expect(await listTransportUnits()).toHaveLength(2);
  });
});
