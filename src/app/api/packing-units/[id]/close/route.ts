import { handle } from '@/lib/api/respond';
import { closePackingUnitSchema, idParamSchema } from '@/lib/api/schemas';
import { closePackingUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return closePackingUnit(actor, idParamSchema.parse(id), closePackingUnitSchema.parse(await req.json()));
  });
}
