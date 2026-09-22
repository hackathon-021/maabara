export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card border border-subtle bg-surface p-4 ${className}`}>{children}</div>;
}
