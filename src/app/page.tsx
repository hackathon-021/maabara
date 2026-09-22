import { redirect } from 'next/navigation';
import { requirePageActor } from '@/lib/session';

// Per-request: the redirect depends on who is signed in.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const actor = await requirePageActor();
  redirect(actor.role === 'commander' ? '/command' : '/field');
}
