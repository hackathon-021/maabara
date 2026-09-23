import { handle } from '@/lib/api/respond';
import { getLeaderboard } from '@/lib/leaderboard';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await requireActor();
    return getLeaderboard();
  });
}
