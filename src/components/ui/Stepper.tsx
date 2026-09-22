'use client';

import { clamp } from './logic';

export function Stepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  label?: string;
}) {
  const set = (n: number) => onChange(clamp(n, 0, max));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`פחות ${label ?? ''}`}
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        className="size-12 rounded-full border-2 border-primary text-2xl font-bold text-primary disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-10 text-center text-xl font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`עוד ${label ?? ''}`}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className="size-12 rounded-full border-2 border-primary text-2xl font-bold text-primary disabled:opacity-30"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => set(max)}
        disabled={value >= max}
        className="min-h-12 rounded-full px-3 text-sm text-link disabled:opacity-30"
      >
        הכל ({max})
      </button>
    </div>
  );
}
