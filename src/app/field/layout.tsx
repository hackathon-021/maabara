import { AppHeader } from '@/components/ui';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { requirePageActor } from '@/lib/session';

// Per-request: the header shows who is signed in.
export const dynamic = 'force-dynamic';

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-page">
      <AppHeader title="המעברה" right={<RoleSwitcher role={actor.role} />} />
      <main className="flex-1 p-4 pb-10">{children}</main>
    </div>
  );
}
