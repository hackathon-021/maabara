import { handle } from '@/lib/api/respond';
import { assignSubordinateSchema } from '@/lib/api/schemas';
import { assignSubordinate } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { subordinateId } = assignSubordinateSchema.parse(await req.json());
    await assignSubordinate(actor.id, subordinateId);
    return { ok: true };
  });
}
