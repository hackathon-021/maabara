import { handle } from '@/lib/api/respond';
import { listPackingUnitsQuery, openPackingUnitSchema } from '@/lib/api/schemas';
import { listPackingUnits, openPackingUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const p = new URL(req.url).searchParams;
    const filter = listPackingUnitsQuery.parse({
      status: p.get('status') ?? undefined,
      roomId: p.get('roomId') ?? undefined,
    });
    return listPackingUnits(filter);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    return openPackingUnit(actor, openPackingUnitSchema.parse(await req.json()));
  });
}
