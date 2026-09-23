'use client';

export interface Option<T> {
  value: T;
  label: string;
  hint?: string | null;
  disabled?: boolean;
}

/** Big tappable rows instead of a <select>: a packer picks a room while holding a box. */
export function OptionList<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <li key={String(o.value)}>
            <button
              type="button"
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              aria-pressed={selected}
              className={`flex min-h-16 w-full flex-col justify-center rounded-card border-2 px-4 text-right ${
                selected ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
              } disabled:opacity-50`}
            >
              <span className="font-bold">{o.label}</span>
              {o.hint && <span className="text-sm text-ink-muted">{o.hint}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
