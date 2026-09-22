import { handle } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/api/schemas';
import { listPackableItems } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireActor();
    const { id } = await params;
    return listPackableItems(idParamSchema.parse(id));
  });
}
