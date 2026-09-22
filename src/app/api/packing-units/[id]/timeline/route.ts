import { handle } from '@/lib/api/respond';
import { Errors } from '@/lib/errors';
import { requireActor } from '@/lib/session';
import { getTimeline } from '@/lib/timeline';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireActor();
    const { id } = await params;
    const packingUnitId = Number(id);
    if (!Number.isInteger(packingUnitId)) throw Errors.notFound('אריזה');
    return getTimeline(packingUnitId);
  });
}
