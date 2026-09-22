import { db, TRUNCATE_ALL_SQL } from '@/lib/db';

export interface Fixture {
  userId: number;
  groupId: number;
  /** status 'done'; laptop x2 (transfer), monitor x1 (salvage); no disposal */
  roomA: number;
  /** status 'done'; chair x1 (transfer), old printer x1 (disposal) */
  roomB: number;
  /** status 'waiting' (not mapped) */
  roomUnmapped: number;
  reports: { laptop: number; monitor: number; chair: number; printer: number };
}

export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(TRUNCATE_ALL_SQL);
}

export async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({ data: { email: 'tester@maabara.local', name: 'בודק', role: 'packer' } });
  const group = await db.group.create({ data: { name: 'מדור בדיקות' } });
  const cat = await db.category.create({ data: { description: 'כללי' } });
  const sub = async (description: string) =>
    (await db.subCategory.create({ data: { categoryId: cat.id, description } })).id;
  const laptopSub = await sub('מחשב נייד');
  const monitorSub = await sub('מסך');
  const chairSub = await sub('כיסא');
  const printerSub = await sub('מדפסת');

  const room = (description: string, status: string) =>
    db.room.create({ data: { groupId: group.id, description, status, roomManager: 'אחראי חדר' } });
  const roomA = await room('חדר A', 'done');
  const roomB = await room('חדר B', 'done');
  const roomUnmapped = await room('חדר לא ממופה', 'waiting');

  const report = async (roomId: number, subCategoryId: number, status: string, quantity: number) =>
    (await db.mappingReport.create({ data: { roomId, subCategoryId, status, quantity, reportedBy: '1234567' } })).id;

  return {
    userId: user.id,
    groupId: group.id,
    roomA: roomA.id,
    roomB: roomB.id,
    roomUnmapped: roomUnmapped.id,
    reports: {
      laptop: await report(roomA.id, laptopSub, 'transfer', 2),
      monitor: await report(roomA.id, monitorSub, 'salvage', 1),
      chair: await report(roomB.id, chairSub, 'transfer', 1),
      printer: await report(roomB.id, printerSub, 'disposal', 1),
    },
  };
}
