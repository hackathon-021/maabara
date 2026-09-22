import { handle } from '@/lib/api/respond';
import { idParamSchema, setItemsSchema } from '@/lib/api/schemas';
import { setPackingUnitItems } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return setPackingUnitItems(actor, idParamSchema.parse(id), setItemsSchema.parse(await req.json()));
  });
}
