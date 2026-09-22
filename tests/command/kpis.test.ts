import { beforeEach, describe, expect, it } from 'vitest';
import { PACKING_UNIT_STATUSES } from '@/lib/contracts';
import { dashboardKpis, tallyBoxes, tallyKpis, type KpiRow } from '@/lib/dashboard';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox } from './helpers';

const row = (over: Partial<KpiRow> = {}): KpiRow => ({
  quantity: 1,
  distributedQuantity: 0,
  itemStatus: 'packed',
  boxStatus: 'closed',
  ...over,
});

describe('tallyKpis', () => {
  it('starts at zero for every bucket', () => {
    expect(tallyKpis([], 0)).toEqual({
      totalMapped: 0,
      packed: 0,
      inTransit: 0,
      received: 0,
      distributed: 0,
      missing: 0,
      short: 0,
    });
  });

  it('separates a packed box still at the source from one already on the road', () => {
    const k = tallyKpis(
      [
        row({ quantity: 2, boxStatus: 'closed' }),
        row({ quantity: 3, boxStatus: 'open' }),
        row({ quantity: 4, boxStatus: 'in_transit' }),
      ],
      20,
    );
    expect(k.packed).toBe(5);
    expect(k.inTransit).toBe(4);
  });

  it('counts received and fully distributed items', () => {
    const k = tallyKpis(
      [
        row({ quantity: 3, itemStatus: 'received', boxStatus: 'received' }),
        row({ quantity: 2, distributedQuantity: 2, itemStatus: 'distributed', boxStatus: 'distributed' }),
      ],
      20,
    );
    expect(k.received).toBe(3);
    expect(k.distributed).toBe(2);
  });

  it('counts a missing item as lost, not as packed', () => {
    const k = tallyKpis([row({ quantity: 5, itemStatus: 'missing', boxStatus: 'missing' })], 20);
    expect(k.missing).toBe(5);
    expect(k.packed).toBe(0);
  });

  // Conventions #2 — a short row is the only one that lands in two buckets.
  it('splits a short item between what was handed over and what was not', () => {
    const k = tallyKpis(
      [row({ quantity: 5, distributedQuantity: 2, itemStatus: 'short', boxStatus: 'distributed_short' })],
      20,
    );
    expect(k.distributed).toBe(2);
    expect(k.short).toBe(3);
  });

  // Review Focus 3.
  it('counts every packed unit exactly once, across every state at once', () => {
    const rows: KpiRow[] = [
      row({ quantity: 2, boxStatus: 'closed' }),
      row({ quantity: 4, boxStatus: 'in_transit' }),
      row({ quantity: 3, itemStatus: 'received', boxStatus: 'received' }),
      row({ quantity: 6, distributedQuantity: 6, itemStatus: 'distributed', boxStatus: 'distributed' }),
      row({ quantity: 5, distributedQuantity: 2, itemStatus: 'short', boxStatus: 'distributed_short' }),
      row({ quantity: 7, itemStatus: 'missing', boxStatus: 'missing' }),
    ];
    const k = tallyKpis(rows, 40);
    const totalPacked = rows.reduce((s, r) => s + r.quantity, 0);
    expect(k.packed + k.inTransit + k.received + k.distributed + k.missing + k.short).toBe(totalPacked);
    expect(totalPacked).toBe(27);
  });

  it('passes the mapped total through untouched', () => {
    expect(tallyKpis([], 14).totalMapped).toBe(14);
  });
});

describe('tallyBoxes', () => {
  // Review Focus 2: the DTO is Record<PackingUnitStatus, number>; a missing key prints "undefined".
  it('carries every status, at zero, for an empty operation', () => {
    const counts = tallyBoxes([]);
    expect(Object.keys(counts).sort()).toEqual([...PACKING_UNIT_STATUSES].sort());
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('counts boxes per status', () => {
    expect(tallyBoxes(['closed', 'closed', 'in_transit', 'missing'])).toMatchObject({
      closed: 2,
      in_transit: 1,
      missing: 1,
      open: 0,
      distributed: 0,
    });
  });
});

describe('dashboardKpis', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('reports an empty operation without crashing', async () => {
    const { kpis, boxCounts } = await dashboardKpis();
    // The fixture maps laptop x2 + monitor x1 + chair x1; the disposal printer is excluded.
    expect(kpis.totalMapped).toBe(4);
    expect(kpis.packed).toBe(0);
    expect(Object.values(boxCounts).every((n) => n === 0)).toBe(true);
  });

  it('reads item quantities and box statuses out of the database', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      code: '10002',
      items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }],
    });

    const { kpis, boxCounts } = await dashboardKpis();
    expect(kpis).toMatchObject({ totalMapped: 4, inTransit: 2, packed: 1 });
    expect(boxCounts).toMatchObject({ in_transit: 1, closed: 1, missing: 0 });
  });

  it('leaves the disposal printer out of the mapped total', async () => {
    // The fixture holds five mapped rows' worth of quantity — laptop 2, monitor 1,
    // chair 1, printer 1 — but the printer is `disposal` and is never packed,
    // so a finished operation must still be able to reach 100%.
    const { kpis } = await dashboardKpis();
    expect(kpis.totalMapped).toBe(4);
  });
});
