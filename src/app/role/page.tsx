'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ROLES, type MeDTO, type Role } from '@/lib/contracts';
import { ROLE_LABELS } from '@/lib/labels';
import { getBadge, getNextBadge } from '@/lib/badges';

// TODO: demo mode — anyone may pick any role (spec §1).
export default function RolePage() {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [me, setMe] = useState<MeDTO | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => null);
  }, []);

  function pick(role: Role) {
    void run(
      () => api.setRole(role),
      () => {
        router.push(role === 'commander' ? '/command' : '/field');
        router.refresh();
      },
    );
  }

  const badge = me ? getBadge(me.actionCount) : null;
  const nextBadge = badge ? getNextBadge(badge) : null;
  const actionsToNext = nextBadge && me ? nextBadge.minActions - me.actionCount : null;
  const progressPct =
    badge && nextBadge && me
      ? Math.round(((me.actionCount - badge.minActions) / (nextBadge.minActions - badge.minActions)) * 100)
      : badge
        ? 100
        : 0;

  return (
    <main
      dir="rtl"
      className="min-h-dvh p-4 bg-[#665FB3] flex items-center justify-center"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">

        {/* Greeting + Badge card */}
        {me && badge && (
          <div
            className="rounded-3xl bg-white p-5 shadow-lg"
            style={{ animation: 'fadeSlideIn 0.35s ease both' }}
          >
            {/* Greeting */}
            <h2 className="text-xl font-semibold text-[#1A1A1A] leading-tight mb-4">
              היי {me.name} 👋
            </h2>

            {/* Badge display */}
            <div
              className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: `${badge.color}18` }}
            >
              <div
                className="text-4xl w-16 h-16 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ background: `${badge.color}28`, boxShadow: `0 0 0 3px ${badge.color}55` }}
              >
                {badge.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: badge.color }}>
                  דרגה נוכחית
                </p>
                <p className="text-lg font-bold text-[#1A1A1A]">{badge.title}</p>
                <p className="text-xs text-[#6B6B76] leading-snug mt-0.5">{badge.description}</p>
              </div>
            </div>

            {/* Progress to next badge */}
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[#6B6B76]">
                  {me.actionCount} פעולות בוצעו
                </span>
                {nextBadge ? (
                  <span className="text-xs text-[#6B6B76]">
                    עוד {actionsToNext} לדרגת <strong>{nextBadge.title}</strong> {nextBadge.icon}
                  </span>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: badge.color }}>
                    דרגה מקסימלית! 🎖️
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-[#E5E5EA] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%`, background: badge.color }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Role selection card */}
        <div
          className="rounded-3xl bg-white p-6 shadow-lg"
          style={{ animation: 'fadeSlideIn 0.45s ease both' }}
        >
          <h1 className="text-xl font-bold mb-4 text-center">מה התפקיד שלך היום?</h1>
          <div className="flex flex-col gap-3">
            {ROLES.map((role) => (
              <button
                key={role}
                disabled={busy}
                onClick={() => pick(role)}
                className="rounded-full border-2 border-[#5F42FF] py-4 text-lg font-bold text-[#5F42FF] disabled:opacity-50 hover:bg-[#5F42FF] hover:text-white transition-colors duration-200"
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
          {error && <Banner tone="danger">{error}</Banner>}
        </div>


      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
