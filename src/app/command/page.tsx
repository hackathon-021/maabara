import { CommandDashboard } from '@/components/command/CommandDashboard';
import { hasCommanderPermission } from '@/lib/command';
import { requirePageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CommandPage() {
  const actor = await requirePageActor();
  return <CommandDashboard showTeamPacking={hasCommanderPermission(actor.rank)} />;
}
