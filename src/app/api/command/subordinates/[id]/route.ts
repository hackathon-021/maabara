import { handle } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/api/schemas';
import { removeSubordinate } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await removeSubordinate(actor.id, idParamSchema.parse(id));
    return { ok: true };
  });
}
