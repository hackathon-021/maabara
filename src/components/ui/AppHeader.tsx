import Link from 'next/link';

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
      <h1 className="flex-1 text-center text-lg font-bold">{title}</h1>
      <div className="flex min-w-24 justify-end">{backHref ? right : null}</div>
    </header>
  );
}
