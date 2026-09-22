import { statusLabel } from '@/lib/labels';
import { statusTone, type Tone } from './logic';

const CHIP: Record<Tone, string> = {
  neutral: 'bg-subtle text-ink',
  info: 'bg-primary-soft text-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

export function StatusChip({ entityType, status }: { entityType: string; status: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${CHIP[statusTone(status)]}`}>
      {statusLabel(entityType, status)}
    </span>
  );
}
