import { handle } from '@/lib/api/respond';
import { idParamSchema, receiveSchema } from '@/lib/api/schemas';
import { receiveTransportUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return receiveTransportUnit(actor, idParamSchema.parse(id), receiveSchema.parse(await req.json()));
  });
}
