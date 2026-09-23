import { handle } from '@/lib/api/respond';
import { getTeamPackingStats } from '@/lib/command';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const actor = await requireActor();
    return getTeamPackingStats(actor.id);
  });
}
