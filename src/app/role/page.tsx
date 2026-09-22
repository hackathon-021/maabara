'use client';

import { useRouter } from 'next/navigation';
import { Banner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ROLES, type Role } from '@/lib/contracts';
import { ROLE_LABELS } from '@/lib/labels';

// TODO: demo mode — anyone may pick any role (spec §1).
export default function RolePage() {
  const router = useRouter();
  const { busy, error, run } = useAction();

  function pick(role: Role) {
    void run(
      () => api.setRole(role),
      () => {
        router.push(role === 'commander' ? '/command' : '/field');
        router.refresh();
      },
    );
  }

  return (
    <main className="min-h-dvh p-4 bg-[#665FB3] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6">
        <h1 className="text-xl font-bold mb-4 text-center">מה התפקיד שלך היום?</h1>
        <div className="flex flex-col gap-3">
          {ROLES.map((role) => (
            <button
              key={role}
              disabled={busy}
              onClick={() => pick(role)}
              className="rounded-full border-2 border-[#5F42FF] py-4 text-lg font-bold text-[#5F42FF] disabled:opacity-50"
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </main>
  );
}
