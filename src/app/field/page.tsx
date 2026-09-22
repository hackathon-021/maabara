import Link from 'next/link';
import { Card } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/labels';
import { requirePageActor } from '@/lib/session';
import { homeActions } from './home-actions';

export const dynamic = 'force-dynamic';

export default async function FieldHome() {
  const actor = await requirePageActor();
  const { primary, others } = homeActions(actor.role);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink">
        שלום {actor.name}
        {actor.role && ` · ${ROLE_LABELS[actor.role]}`}
      </p>

      {primary && (
        <Link href={primary.href} className="block">
          <Card className="border-2 border-primary">
            <p className="text-xl font-bold text-primary">{primary.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{primary.body}</p>
          </Card>
        </Link>
      )}

      {others.length > 0 && (
        <>
          <p className="mt-2 text-sm text-ink-muted">{primary ? 'פעולות נוספות' : 'בחרו פעולה'}</p>
          <div className="flex flex-col gap-3">
            {others.map((action) => (
              <Link key={action.href} href={action.href} className="block">
                <Card>
                  <p className="font-bold">{action.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{action.body}</p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
