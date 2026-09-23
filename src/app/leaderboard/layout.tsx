import { AppHeader } from '@/components/ui';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { hasCommanderPermission } from '@/lib/command';
import { requirePageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="flex h-dvh justify-center bg-page p-3">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface shadow-lg">
        <AppHeader
          title="טבלת דירוג"
          backHref={actor.role === 'commander' ? '/command' : '/field'}
          right={<RoleSwitcher role={actor.role} showTeamLink={hasCommanderPermission(actor.rank)} />}
          showLeaderboardLink={false}
        />
        <main className="flex-1 overflow-y-auto p-4 pb-10">{children}</main>
      </div>
    </div>
  );
}
