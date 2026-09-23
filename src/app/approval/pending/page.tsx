import { redirect } from 'next/navigation';
import { requireAnyPageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ApprovalPendingPage() {
  const actor = await requireAnyPageActor();
  if (actor.approvalStatus === 'approved') redirect(actor.role ? '/' : '/role');
  if (actor.requestedCommanderId == null) redirect('/approval/request');

  return (
    <main className="min-h-dvh p-4 bg-[#665FB3] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center">
        <h1 className="text-xl font-bold mb-2">ממתין לאישור</h1>
        <p className="text-gray-600 mb-6">הבקשה נשלחה למפקד הישיר שלכם וממתינה לאישורו.</p>
        <a href="/approval/pending" className="text-[#5F42FF] font-bold">
          בדוק שוב
        </a>
      </div>
    </main>
  );
}
