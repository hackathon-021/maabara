import { handle } from '@/lib/api/respond';
import { setRankSchema } from '@/lib/api/schemas';
import { setRank } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function PATCH(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { userId, rank } = setRankSchema.parse(await req.json());
    await setRank(actor.id, userId, rank);
    return { ok: true };
  });
}
