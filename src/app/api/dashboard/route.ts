import { handle } from '@/lib/api/respond';
import { getDashboard } from '@/lib/dashboard';
import { requireActor } from '@/lib/session';

// Polled every 3 seconds; never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await requireActor();
    return getDashboard();
  });
}
