'use client';

export function TextField({
  label,
  value,
  onChange,
  inputMode = 'text',
  maxLength,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'text' | 'numeric';
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className="min-h-14 rounded-card border-2 border-subtle bg-surface px-4 text-lg focus:border-primary focus:outline-none"
      />
    </label>
  );
}
