import { AppHeader } from '@/components/ui';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { requirePageActor } from '@/lib/session';

// Per-request: the header shows who is signed in.
export const dynamic = 'force-dynamic';

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    // Purple app frame with a rounded white "phone screen" inset, matching /login's card-on-purple look (design/design.md).
    <div className="flex h-dvh justify-center bg-page p-3">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface shadow-lg">
        <AppHeader title="המעברה" right={<RoleSwitcher role={actor.role} />} />
        <main className="flex-1 overflow-y-auto p-4 pb-10">{children}</main>
      </div>
    </div>
  );
}
