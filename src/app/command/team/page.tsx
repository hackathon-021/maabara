import { redirect } from 'next/navigation';
import { hasCommanderPermission } from '@/lib/command';
import { requirePageActor } from '@/lib/session';
import { TeamView } from './TeamView';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const actor = await requirePageActor();
  if (!hasCommanderPermission(actor.rank)) redirect('/field');
  return <TeamView actorId={actor.id} actorRank={actor.rank} />;
}
