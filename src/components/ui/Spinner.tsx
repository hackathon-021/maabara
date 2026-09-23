export function Spinner({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-white/80">
      <span className="size-5 animate-spin rounded-full border-2 border-subtle border-t-primary" />
      <span>{label}</span>
    </div>
  );
}
