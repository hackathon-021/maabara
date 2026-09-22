import { handle } from '@/lib/api/respond';
import { createTransportSchema, transportStatusQuery } from '@/lib/api/schemas';
import { createTransportUnit, listTransportUnits } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const status = transportStatusQuery.parse(new URL(req.url).searchParams.get('status') ?? undefined);
    return listTransportUnits(status);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    return createTransportUnit(actor, createTransportSchema.parse(await req.json()));
  });
}
