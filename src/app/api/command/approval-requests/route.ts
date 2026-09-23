import { handle } from '@/lib/api/respond';
import { getPendingApprovalRequests } from '@/lib/approval';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const actor = await requireActor();
    return getPendingApprovalRequests(actor.id);
  });
}
