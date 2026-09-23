import Link from 'next/link';
import { Card } from '@/components/ui';
import { requirePageActor } from '@/lib/session';
import { homeActions } from './home-actions';
import { getBadge, getNextBadge, BADGES } from '@/lib/badges';
import { countUserActions } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function FieldHome() {
  const actor = await requirePageActor();
  const { primary, others } = homeActions(actor.role);

  // Counts completed operational units (1 box packed = 1 action, 1 truck dispatched = 1 action, etc.)
  const actionCount = await countUserActions(actor.id);

  const badge = getBadge(actionCount);
  const nextBadge = getNextBadge(badge);
  const actionsToNext = nextBadge ? nextBadge.minActions - actionCount : null;
  const progressPct =
    nextBadge
      ? Math.round(((actionCount - badge.minActions) / (nextBadge.minActions - badge.minActions)) * 100)
      : 100;

  return (
    <div className="flex flex-col gap-4" dir="rtl">

      {/* Badge card */}
      <div
        className="rounded-2xl bg-white px-4 py-3 shadow-sm"
        style={{ animation: 'fadeSlideIn 0.35s ease both' }}
      >
        {/* Greeting + rank inline */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-semibold text-[#1A1A1A]">
            היי {actor.name} 👋
          </span>
          <span
            className="text-xs font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: `${badge.color}20`, color: badge.color }}
          >
            {badge.title}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] text-[#6B6B76]">{actionCount} פעולות</span>
          {nextBadge ? (
            <span className="text-[11px] text-[#6B6B76]">
              עוד {actionsToNext} לדרגת <strong>{nextBadge.title}</strong>
            </span>
          ) : (
            <span className="text-[11px] font-semibold" style={{ color: badge.color }}>מקסימלי 🎖️</span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-[#E5E5EA] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, background: badge.color }}
          />
        </div>

        {/* Top-rank teaser — hidden once they've made it */}
        {badge.key !== 'legend' && (() => {
          const top = BADGES[BADGES.length - 1];
          return (
            <p className="mt-2 text-[11px] text-center" style={{ color: top.color }}>
              🏆 האם תגיע ל<strong>{top.title}</strong>?
            </p>
          );
        })()}
      </div>

      {/* Primary action */}
      {primary && (
        <Link href={primary.href} className="block">
          <Card className="border-2 border-primary">
            <p className="text-xl font-bold text-primary">{primary.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{primary.body}</p>
          </Card>
        </Link>
      )}

      {/* Other actions */}
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

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
