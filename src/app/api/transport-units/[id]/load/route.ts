import { handle } from '@/lib/api/respond';
import { idParamSchema, loadSchema } from '@/lib/api/schemas';
import { loadTransportUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return loadTransportUnit(actor, idParamSchema.parse(id), loadSchema.parse(await req.json()));
  });
}
