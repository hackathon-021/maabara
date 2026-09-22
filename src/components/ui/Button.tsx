'use client';

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';
type Size = 'lg' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white disabled:opacity-40',
  secondary: 'bg-surface text-primary border-2 border-primary disabled:opacity-40',
  quiet: 'bg-transparent text-ink-muted underline disabled:opacity-40',
};

// lg is the field default: a thumb on a box, not a mouse.
const SIZES: Record<Size, string> = {
  lg: 'min-h-16 px-6 text-lg font-bold',
  md: 'min-h-12 px-4 text-base font-medium',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  busy = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`w-full rounded-full ${VARIANTS[variant]} ${SIZES[size]} active:scale-[0.99] ${className}`}
    >
      {busy ? 'רגע…' : children}
    </button>
  );
}
