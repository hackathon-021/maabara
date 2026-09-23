import { handle } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/api/schemas';
import { rejectRequest } from '@/lib/approval';
import { requireActor } from '@/lib/session';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await rejectRequest(actor.id, idParamSchema.parse(id));
    return { ok: true };
  });
}
