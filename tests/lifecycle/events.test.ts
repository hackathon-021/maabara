import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { DEFAULT_RECIPIENTS, formatHe, notify, recordEvent } from '@/lib/lifecycle/events';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('events', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('records an event inside the caller transaction', async () => {
    await db.$transaction(async (tx) => {
      await recordEvent(tx, {
        entityType: 'room',
        entityId: fx.roomA,
        fromStatus: 'done',
        toStatus: 'packing',
        actorId: fx.userId,
        note: 'בדיקה',
      });
    });
    const events = await db.statusEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'room',
      entityId: fx.roomA,
      fromStatus: 'done',
      toStatus: 'packing',
      actorId: fx.userId,
      note: 'בדיקה',
    });
  });

  it('rolls the event back when the caller transaction fails', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await recordEvent(tx, {
          entityType: 'room', entityId: fx.roomA, fromStatus: null, toStatus: 'packing', actorId: fx.userId,
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.statusEvent.count()).toBe(0);
  });

  it('writes a mocked SMS row with the default distribution list', async () => {
    await db.$transaction((tx) =>
      notify(tx, { body: 'יחידת הובלה הועמסה', entityType: 'transport_unit', entityId: 7 }),
    );
    const [sms] = await db.notification.findMany();
    expect(sms).toMatchObject({ channel: 'sms', recipients: DEFAULT_RECIPIENTS, body: 'יחידת הובלה הועמסה' });
  });

  it('formats a timestamp in Israel time for SMS bodies', () => {
    // 09:05 UTC in September is 12:05 in Jerusalem (UTC+3).
    expect(formatHe(new Date('2026-09-22T09:05:00Z'))).toContain('12:05');
  });
});
