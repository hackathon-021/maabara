import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { resetDb, seedFixture } from '../helpers/db';

describe('seedFixture', () => {
  beforeEach(resetDb);

  it('creates the documented rooms and reports', async () => {
    const fx = await seedFixture();
    const roomA = await db.room.findUniqueOrThrow({ where: { id: fx.roomA }, include: { mappingReports: true } });
    expect(roomA.status).toBe('done');
    expect(roomA.mappingReports.map((r) => `${r.status}:${r.quantity}`).sort()).toEqual(['salvage:1', 'transfer:2']);
    const printer = await db.mappingReport.findUniqueOrThrow({ where: { id: fx.reports.printer } });
    expect(printer.status).toBe('disposal');
    expect(printer.roomId).toBe(fx.roomB);
    const unmapped = await db.room.findUniqueOrThrow({ where: { id: fx.roomUnmapped } });
    expect(unmapped.status).toBe('waiting');
  });

  it('resetDb empties everything', async () => {
    await seedFixture();
    await resetDb();
    expect(await db.room.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });
});
