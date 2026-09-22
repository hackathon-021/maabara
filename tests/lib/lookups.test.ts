import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listGroups, listRooms } from '@/lib/lookups';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('lookups', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('lists available groups', async () => {
    await db.group.create({ data: { name: 'מדור מחוק', isAvailable: false } });
    expect(await listGroups()).toEqual([{ id: fx.groupId, name: 'מדור בדיקות' }]);
  });

  it('lists available rooms of one group, sorted by description', async () => {
    await db.room.update({ where: { id: fx.roomB }, data: { isAvailable: false } });
    const rooms = await listRooms(fx.groupId);
    expect(rooms.map((r) => r.description)).toEqual(['חדר A', 'חדר לא ממופה']);
    expect(rooms[0]).toEqual({
      id: fx.roomA, groupId: fx.groupId, description: 'חדר A', status: 'done', roomManager: 'אחראי חדר',
    });
  });
});
