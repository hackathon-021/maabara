'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ROLES, type Role } from '@/lib/contracts';
import { ROLE_LABELS } from '@/lib/labels';

/** Compact role dropdown + sign-out link, for the field and command headers. */
export function RoleSwitcher({ role }: { role: Role | null }) {
  const router = useRouter();

  async function change(next: Role) {
    await api.setRole(next);
    router.push(next === 'commander' ? '/command' : '/field');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        aria-label="החלפת תפקיד"
        value={role ?? ''}
        onChange={(e) => change(e.target.value as Role)}
        className="rounded-full border border-[#E5E5EA] bg-white px-3 py-1"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {/* Full page load on purpose: /api/auth/signout is an Auth.js route, not a Next.js page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/api/auth/signout" className="text-[#005DF5]">
        יציאה
      </a>
    </div>
  );
}
