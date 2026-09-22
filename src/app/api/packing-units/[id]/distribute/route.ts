import { handle } from '@/lib/api/respond';
import { distributeSchema, idParamSchema } from '@/lib/api/schemas';
import { distributePackingUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return distributePackingUnit(actor, idParamSchema.parse(id), distributeSchema.parse(await req.json()));
  });
}
