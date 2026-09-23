import { PrismaClient } from '@prisma/client';
import { TRUNCATE_ALL_SQL } from '../src/lib/db';

// Demo reset: wipes everything and loads the demo world. Safe to run between rehearsals.
const db = new PrismaClient();

async function main() {
  await db.$executeRawUnsafe(TRUNCATE_ALL_SQL);

  const tikshuv = await db.group.create({ data: { name: 'ענף תקשוב — מדור מערכות' } });
  const logistics = await db.group.create({ data: { name: 'ענף לוגיסטיקה — מדור אחזקה' } });
  const building = await db.location.create({ data: { name: 'בניין 12 (בסיס מקור)' } });

  const subs: Record<string, number> = {};
  const categories: Record<string, string[]> = {
    'מחשוב': ['מחשב נייד', 'מסך', 'מקלדת', 'נתב'],
    'ריהוט': ['כיסא', 'שולחן'],
    'ציוד משרדי': ['מדפסת', 'טלפון שולחני'],
    'ציוד רגיש': ['כספת', 'מכשיר קשר'],
  };
  for (const [category, names] of Object.entries(categories)) {
    const cat = await db.category.create({ data: { description: category } });
    for (const name of names) {
      subs[name] = (await db.subCategory.create({ data: { categoryId: cat.id, description: name } })).id;
    }
  }

  const room = (groupId: number, description: string, status: string, roomManager: string) =>
    db.room.create({ data: { groupId, locationId: building.id, description, status, roomManager } });
  const r101 = await room(tikshuv.id, 'חדר 101', 'done', 'רס"ל דנה כהן');
  const r102 = await room(tikshuv.id, 'חדר 102', 'done', 'סמ"ר יואב לוי');
  await room(tikshuv.id, 'חדר 103', 'waiting', 'סמל נועה פרץ');
  const r201 = await room(logistics.id, 'חדר 201', 'done', 'רס"ב אבי מזרחי');

  const report = (roomId: number, sub: string, status: string, quantity: number, serial?: string, description?: string) =>
    db.mappingReport.create({
      data: { roomId, subCategoryId: subs[sub], status, quantity, serial, description, reportedBy: '7654321' },
    });

  // Room 101: the main demo room — two boxes empty it and it becomes 'closed'.
  await report(r101.id, 'מחשב נייד', 'transfer', 2, 'LT-4471');
  await report(r101.id, 'מסך', 'transfer', 2);
  await report(r101.id, 'טלפון שולחני', 'salvage', 1);
  // Room 102: has a disposal item → becomes 'awaiting_disposal' when fully packed.
  await report(r102.id, 'כיסא', 'transfer', 4);
  await report(r102.id, 'שולחן', 'transfer', 1);
  await report(r102.id, 'מדפסת', 'disposal', 1, undefined, 'מדפסת ישנה לגריטה');
  // Room 201: sensitive equipment.
  await report(r201.id, 'מכשיר קשר', 'transfer', 3, 'MK-2231');
  await report(r201.id, 'כספת', 'transfer', 1, 'SF-09');

  await db.user.create({
    data: {
      email: 'dev@maabara.local', name: 'משתמש פיתוח', role: 'commander', rank: 'unit_commander',
      approvalStatus: 'approved', isAdmin: true,
    },
  });
}

main()
  .then(() => console.log('Demo data loaded'))
  .finally(() => db.$disconnect());
