'use client';

/**
 * A sheet pinned to the bottom of the screen — reachable with a thumb.
 * Not a <dialog>: the field app never needs focus trapping and the demo runs on
 * four different phones. // TODO: real focus management if this ships.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-4 sm:rounded-card"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="סגירה" className="px-2 text-2xl text-ink-muted">
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
