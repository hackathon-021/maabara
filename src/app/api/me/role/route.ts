import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { requireActor } from '@/lib/session';
import { setUserRole } from '@/lib/users';

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { role } = z.object({ role: z.string() }).parse(await req.json());
    return setUserRole(actor.id, actor.rank, role);
  });
}
