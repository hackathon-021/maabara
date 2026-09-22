import { beforeEach, describe, expect, it } from 'vitest';
import { dashboardRooms, dashboardTrucks } from '@/lib/dashboard';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeTruck } from './helpers';

describe('dashboardRooms', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('reports every room with its group and its mapped total', async () => {
    const rooms = await dashboardRooms();
    const a = rooms.find((r) => r.id === fx.roomA);
    expect(a).toMatchObject({ status: 'done', mappedQty: 3, packedQty: 0 });
    expect(a?.groupName).toBeTruthy();
    expect(a?.description).toBeTruthy();
  });

  it('leaves a disposal item out of the mapped total', async () => {
    // fx.roomB: chair x1 (transfer) + printer x1 (disposal).
    expect((await dashboardRooms()).find((r) => r.id === fx.roomB)?.mappedQty).toBe(1);
  });

  it('adds up what has been packed out of the room, across boxes', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }],
    });
    expect((await dashboardRooms()).find((r) => r.id === fx.roomA)?.packedQty).toBe(3);
  });

  // Review Focus 2: a room nobody has mapped yet still has to render.
  it('reports an unmapped room as zero rather than omitting it', async () => {
    const room = (await dashboardRooms()).find((r) => r.id === fx.roomUnmapped);
    expect(room).toMatchObject({ mappedQty: 0, packedQty: 0, status: 'waiting' });
  });

  it('keeps a stable order so the grid does not reshuffle under the poll', async () => {
    const first = (await dashboardRooms()).map((r) => r.id);
    const second = (await dashboardRooms()).map((r) => r.id);
    expect(second).toEqual(first);
  });
});

describe('dashboardTrucks', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('is empty before anything is loaded', async () => {
    expect(await dashboardTrucks()).toEqual([]);
  });

  it('reports the plate, the status, the box count and the departure time', async () => {
    const departedAt = new Date(2026, 8, 22, 14, 5);
    const truckId = await makeTruck(fx, { status: 'in_transit', licensePlate: '12-345-67', departedAt });
    await makeBox(fx, { roomId: fx.roomA, status: 'in_transit', code: '10001', transportUnitId: truckId });
    await makeBox(fx, { roomId: fx.roomA, status: 'in_transit', code: '10002', transportUnitId: truckId });

    expect(await dashboardTrucks()).toEqual([
      {
        id: truckId,
        licensePlate: '12-345-67',
        type: 'truck',
        status: 'in_transit',
        boxCount: 2,
        departedAt: departedAt.toISOString(),
      },
    ]);
  });

  it('reports a truck that has not departed with a null departure time', async () => {
    await makeTruck(fx, { status: 'loading' });
    expect((await dashboardTrucks())[0]).toMatchObject({ status: 'loading', boxCount: 0, departedAt: null });
  });

  it('puts the newest transport unit first', async () => {
    await makeTruck(fx, { status: 'released', licensePlate: '11-111-11' });
    await makeTruck(fx, { status: 'loading', licensePlate: '22-222-22' });
    expect((await dashboardTrucks()).map((t) => t.licensePlate)).toEqual(['22-222-22', '11-111-11']);
  });
});
