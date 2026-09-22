import { Card } from './Card';

// design/design.md: friendly, reassuring empty states — never a bare "no results".
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <Card className="text-center">
      <div aria-hidden className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-primary-soft text-3xl">
        📦
      </div>
      <p className="font-bold">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
