import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { listRooms } from '@/lib/lookups';
import { requireActor } from '@/lib/session';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const groupId = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('groupId'));
    return listRooms(groupId);
  });
}
