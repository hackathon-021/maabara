import { redirect } from 'next/navigation';
import { requireAnyPageActor } from '@/lib/session';
import { ApprovalRequestForm } from './ApprovalRequestForm';

export const dynamic = 'force-dynamic';

export default async function ApprovalRequestPage() {
  const actor = await requireAnyPageActor();
  if (actor.approvalStatus === 'approved') redirect(actor.role ? '/' : '/role');
  if (actor.requestedCommanderId != null) redirect('/approval/pending');
  return <ApprovalRequestForm />;
}
