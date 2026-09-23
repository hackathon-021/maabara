import Link from 'next/link';

/** Outline trophy icon, consistent stroke weight (design/design.md). */
function TrophyIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" />
      <path d="M10 15v2H9a1 1 0 0 0-1 1v1h8v-1a1 1 0 0 0-1-1h-1v-2" />
    </svg>
  );
}

/** Trophy link to the system-wide leaderboard, shown on every screen that has a header. */
function LeaderboardLink() {
  return (
    <Link href="/leaderboard" aria-label="טבלת דירוג" className="text-primary">
      <TrophyIcon />
    </Link>
  );
}

/** White bar, centred title, back/exit affordances top-left (design/design.md). */
export function AppHeader({ title, backHref, right }: { title: string; backHref?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-subtle bg-surface px-4">
      <div className="flex min-w-24 justify-start">
        {backHref ? (
          <Link href={backHref} className="text-link">
            חזרה
          </Link>
        ) : (
          right
        )}
      </div>
      <div className="flex flex-1 items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no next/image optimizer configured (design/design.md) */}
        <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <div className="flex min-w-24 items-center justify-end gap-3">
        {backHref && right}
        <LeaderboardLink />
      </div>
    </header>
  );
}
