import { handle } from '@/lib/api/respond';
import { listGroups } from '@/lib/lookups';
import { requireActor } from '@/lib/session';

export async function GET() {
  return handle(async () => {
    await requireActor();
    return listGroups();
  });
}
