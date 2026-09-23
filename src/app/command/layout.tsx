import { RoleSwitcher } from '@/components/RoleSwitcher';
import { AppHeader } from '@/components/ui';
import { requirePageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="min-h-dvh bg-page">
      <AppHeader title="המעברה — תמונת מצב" right={<RoleSwitcher role={actor.role} />} />
      <main className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</main>
    </div>
  );
}
