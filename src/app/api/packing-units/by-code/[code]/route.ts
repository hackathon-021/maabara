import { handle } from '@/lib/api/respond';
import { boxCodeSchema } from '@/lib/api/schemas';
import { getPackingUnitByCode } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    await requireActor();
    const { code } = await params;
    return getPackingUnitByCode(boxCodeSchema.parse(decodeURIComponent(code)));
  });
}
