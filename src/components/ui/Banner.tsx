type Tone = 'info' | 'ok' | 'warn' | 'danger';

const TONES: Record<Tone, string> = {
  info: 'bg-primary-soft text-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

export function Banner({ tone, title, children }: { tone: Tone; title?: string; children?: React.ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-card p-4 ${TONES[tone]}`}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className="text-sm leading-6">{children}</div>}
    </div>
  );
}
