# P3 — Field Shell, Design System & Pack Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bare Next.js scaffold into the Hebrew RTL field app — design tokens, a shared UI kit the rest of the team builds on, the `/field` shell and home screen, the complete packing flow (room → unit type → contents → destination → close), and the printable QR label.

**Architecture:** One design token layer in `src/app/globals.css` (Tailwind v4 `@theme`), one root layout that turns the whole app RTL and Hebrew, one UI kit under `src/components/ui/**` that every screen in the app imports, and the pack flow as two routes: `/field/pack` (pick where you are packing) and `/field/pack/[unitId]` (fill it, address it, close it). Every screen is a thin client component over `api` from `@/lib/api/client`; all decisions that can be made without React live in plain `logic.ts` modules so they can be unit-tested in the node test environment.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, SWR, `qrcode.react`, Vitest 3 (node environment — no DOM, no React rendering tests).

**Spec:** `docs/generated/2026-09-22-mvp-design.md` (§2 architecture, §5.1 pack, §5.5 field UX rules, §7 errors).
**Master plan (team split, file ownership, frozen contracts):** `docs/generated/plan.md` — §4 ownership, §5 contracts.
**Source material:** `design/design.md` (visual language), `flows/packing_flow.md` (the flow this implements), `personas/packer_persona.md` (who uses it).

## Global Constraints

See `docs/generated/plan.md` → Global Constraints. The ones that bite this workstream:

- Hackathon MVP: prefer quick and demoable; mark every shortcut with `// TODO:` and a reason.
- Code, identifiers and comments in **English**. Every user-facing string in **Hebrew**. The whole app is RTL: `<html lang="he" dir="rtl">`.
- Design tokens, exact values, from `design/design.md`: primary `#5F42FF`, active chip bg `#D7D0FF`, page bg `#665FB3`, surface `#FFFFFF`, border `#E5E5EA`, link `#005DF5`, text `#1A1A1A`. Pill primary buttons; white cards radius 16–20px; font Heebo.
- Only `src/lib/lifecycle/**` may write `status` columns, `status_events` or `notifications`. Every P3 screen is a caller — it reads DTOs and posts requests, nothing more.
- UI code calls **only** `api` from `@/lib/api/client`. Never `fetch('/api/...')` directly, never a Prisma import in a client component.
- Never redefine a type that exists in `src/lib/contracts.ts`, never hand-write a Hebrew status string that exists in `src/lib/labels.ts`.
- Never edit a file you do not own (`docs/generated/plan.md` §4). P3 owns: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, `src/lib/feedback.ts`, `src/components/QrLabel.tsx`, `src/app/field/layout.tsx`, `src/app/field/page.tsx`, `src/app/field/pack/**`, `tests/field/pack/**`. This plan also adds `tests/field/ui/**` and `tests/field/shell/**` — new directories, P3's, announced in team chat at Task 1.
- Box codes are exactly 5 digits (`/^\d{5}$/`). The QR payload is the bare 5-digit code — no URL, no JSON, no prefix. P4's scanner reads exactly what this plan's label writes.
- Out of scope for the whole MVP: offline mode, editing or reopening closed boxes, UI rendering tests.

## Conventions this plan commits to

Five decisions the rest of the plan depends on. Read them before Task 1.

1. **Pure logic lives in `logic.ts`, React lives in `.tsx`.** Vitest runs in the node environment with no jsdom and no React Testing Library, and spec §8 rules out UI tests. So every rule worth testing — what the maximum quantity for an item is, what the completion screen says, which Hebrew message an error becomes — is a plain exported function in a `logic.ts` / `errors.ts` module, and the component is a thin renderer over it. When you are tempted to put an `if` inside JSX, move it to `logic.ts` and test it.

2. **Packable items are fetched once per open box, never re-fetched.** `GET /api/rooms/:id/packable-items` subtracts everything already sitting in a box — *including the box you are filling right now*. Re-fetching it after saving contents would show the packer a smaller maximum than the truth, and an item entirely allocated to this box would vanish from the screen. The screen loads the list once, holds the draft in React state, and reconciles against the box's own saved rows via `itemRows()` (Task 7). This is the single most important correctness rule in this plan — it is what "zero equipment loss" means on the packing screen.

3. **Contents are saved with `PUT /items` once, when the packer leaves the contents step.** P2 handles a repeated `PUT` correctly (it excludes the box's own rows when measuring remaining), so a second save is safe — but one save per step keeps the audit trail and the network quiet on a phone.

4. **No bottom navigation bar.** `design/design.md` describes a 2–5 item bottom nav, but the field app has exactly one section — the four chain actions are the home screen itself, not a persistent nav. The header carries the exit/role affordance instead, which the design does specify (`יציאה` anchored top-left). `// TODO: add bottom nav if a second field section ever appears.`

5. **Back affordances are the word `חזרה`, never an arrow glyph.** Directional arrows in an RTL document are a bidi bug waiting to happen on a phone at 6am, and nothing in the flow needs one.

## Review Focus

Input classes the spec implies that the happy path never reaches. Each one has a test in the task that owns the code.

1. **A packer reopens (or refreshes) `/field/pack/[unitId]` on a box whose contents were already saved.** The per-item maximum must be `remaining + this box's own saved quantity`, and an item whose entire remaining quantity is already in this box must still be listed with its quantity — the server drops it from `packable-items` at remaining 0. Otherwise the packer loses the ability to see or reduce what they packed. → Task 7.
2. **The contents screen gets a 4xx instead of a list** — `ROOM_NOT_MAPPED` (409) from `packable-items`, or a 401 after the session expires mid-flow. It must show the Hebrew `messageHe` on the screen with the error sound, and a 401 must land the packer on `/login` — never a blank page or an English stack trace. → Task 3 (`describeError`) and Task 7 (render).
3. **A room with nothing left to pack** — everything already packed, or the room only ever had `disposal` items. The contents screen shows a friendly empty state and `סיום אריזה` stays disabled for a non-personal box, so the packer never round-trips into the server's `יש לבחור פריטים לאריזה`. → Task 7.
4. **Destination fields containing only whitespace.** `בניין: "   "` must be rejected on the phone with a Hebrew hint, and what is sent to the server must be trimmed — a box whose destination is three spaces is a box the distributor cannot deliver. → Task 8.
5. **A completion screen with no room check.** A personal carton closes with `roomCheck === null`, and a non-personal box can come back with `remaining === 0` while the room is still `packing`. The screen must never render `null`, never claim `חדר סגור` unless the server said `closed`, and must still offer `אריזה נוספת`. → Task 8.

---

### Task 1: Design tokens, RTL root layout, Heebo

Everything the other four people see first. Do this before anything else and merge it fast — P1's login page, P4's scan screens and P5's dashboard all inherit these tokens.

**Files:**
- Modify: `src/app/globals.css` (replace the whole file), `src/app/layout.tsx` (replace the whole file)
- Test: `tests/field/ui/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities generated from the `@theme` block — `bg-primary`, `bg-primary-soft`, `bg-page`, `bg-surface`, `border-subtle`, `text-link`, `text-ink`, `text-ink-muted`, `text-danger`, `text-warn`, `text-ok`, `bg-danger-soft`, `bg-warn-soft`, `bg-ok-soft`, `rounded-card`, `font-sans`; the CSS class `print-label` (Task 9 uses it); `<html lang="he" dir="rtl">` for the whole app.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/tokens
```

- [ ] **Step 2: Write the failing test** — `tests/field/ui/tokens.test.ts`

This is a guard, not a render test: it pins the exact hex values from `design/design.md` so a later "small tweak" cannot silently drift the brand across five people's screens.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');

describe('design tokens', () => {
  // Exact values from design/design.md — do not "adjust" one without changing the design doc.
  it.each([
    ['--color-primary', '#5F42FF'],
    ['--color-primary-soft', '#D7D0FF'],
    ['--color-page', '#665FB3'],
    ['--color-surface', '#FFFFFF'],
    ['--color-subtle', '#E5E5EA'],
    ['--color-link', '#005DF5'],
    ['--color-ink', '#1A1A1A'],
  ])('defines %s as %s', (token, hex) => {
    expect(css).toContain(`${token}: ${hex}`);
  });

  it('exposes the Heebo variable as the sans font', () => {
    expect(css).toContain('--font-sans: var(--font-heebo)');
  });

  it('has no dark-mode override — the field app is one fixed theme', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
});

describe('root layout', () => {
  it('is Hebrew and right-to-left', () => {
    expect(layout).toContain('lang="he"');
    expect(layout).toContain('dir="rtl"');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/ui/tokens.test.ts
```

Expected: FAIL — the scaffold's `globals.css` still has `--background`, `prefers-color-scheme` and Geist, and `layout.tsx` still says `lang="en"`.

If the run fails with `Refusing to run tests: DATABASE_URL in .env.test must point at a *test* database`, that is `tests/setup.ts` doing its job — create `.env.test` as described at Checkpoint A. P3's tests never touch the database, but they run through the same setup file.

- [ ] **Step 4: Replace `src/app/globals.css` entirely**

```css
@import "tailwindcss";

/* Design tokens — design/design.md. Tailwind v4 turns each --color-* into bg-*/text-*/border-* utilities. */
@theme {
  --color-primary: #5F42FF;
  --color-primary-soft: #D7D0FF;
  --color-page: #665FB3;
  --color-surface: #FFFFFF;
  --color-subtle: #E5E5EA;
  --color-link: #005DF5;
  --color-ink: #1A1A1A;
  --color-ink-muted: #6B6B76;

  /* Status tones. Not in the design doc — chosen to sit next to the purple without competing with it. */
  --color-ok: #1B7F3B;
  --color-ok-soft: #E6F4EA;
  --color-warn: #B26A00;
  --color-warn-soft: #FDF1DF;
  --color-danger: #C62828;
  --color-danger-soft: #FCE8E8;

  --radius-card: 20px;
  --font-sans: var(--font-heebo), system-ui, sans-serif;
}

body {
  font-family: var(--font-sans);
}

/* Field screens are operated one-handed while carrying a box: never shrink a tap target below this. */
button,
input,
select {
  font: inherit;
}

/* Task 9: printing a box label must put the label alone on the page. */
@media print {
  body * {
    visibility: hidden;
  }
  .print-label,
  .print-label * {
    visibility: visible;
  }
  .print-label {
    position: absolute;
    inset-inline-start: 0;
    top: 0;
    width: 100%;
  }
  .print-hide {
    display: none !important;
  }
}
```

- [ ] **Step 5: Replace `src/app/layout.tsx` entirely**

```tsx
import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'המעברה',
  description: 'מערכת ניהול פינוי, הובלה וקליטת ציוד',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5F42FF',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Run the test and the build**

```bash
npm test -- tests/field/ui/tokens.test.ts
npm run build
```

Expected: PASS, and a clean build. If the build complains that `Geist` is still imported somewhere, you missed a scaffold leftover — search for it:

```bash
grep -rn "Geist\|geist" src/
```

- [ ] **Step 7: Look at it on a phone-sized viewport**

```bash
npm run dev
```

Open `http://localhost:3000/role` in a browser at 390×844. Expected: purple `#665FB3` page, white card, Hebrew text right-aligned, Heebo (not Arial). P1's role page is unstyled by P3's kit yet — that is fine, you are only checking tokens and direction.

- [ ] **Step 8: Commit and announce**

```bash
git add src/app/globals.css src/app/layout.tsx tests/field/ui/tokens.test.ts
git commit -m "feat(ui): Hebrew RTL shell, design tokens and Heebo"
```

Open the PR, merge it, and post in team chat: *"Tokens are on main — use `bg-primary`, `bg-page`, `bg-surface`, `border-subtle`, `text-ink`, `rounded-card` instead of hex literals. `tests/field/ui/**` and `tests/field/shell/**` are mine."*

---

### Task 2: Field feedback — sound and vibration

Spec §5.5: "audio + vibration on scan success/failure". P4's scanner is the heaviest user of this, so it ships early and standalone.

**Files:**
- Create: `src/lib/feedback.ts`
- Test: `tests/field/ui/feedback.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `feedback(kind: 'success' | 'error'): void`, `FEEDBACK_PATTERNS` (the tone/vibration table). P4 imports `feedback` on every scan; Task 3's `useAction` calls it on every action result.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/feedback
```

- [ ] **Step 2: Write the failing test** — `tests/field/ui/feedback.test.ts`

The valuable assertions here are the two failure modes a phone actually produces: iOS Safari has no `navigator.vibrate`, and an `AudioContext` can refuse to start. Neither may ever throw into a field screen.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeOscillator {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  constructor() {
    FakeAudioContext.last = this;
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createGain() {
    return new FakeGain();
  }
}

const vibrate = vi.fn();

beforeEach(() => {
  vi.resetModules();
  FakeAudioContext.last = null;
  vibrate.mockClear();
  // The module reads window/navigator lazily, so a node-environment stub is enough.
  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  vi.stubGlobal('navigator', { vibrate });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback', () => {
  it('plays a high short tone and a single buzz on success', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('success');
    expect(FakeAudioContext.last?.oscillators[0].frequency.value).toBe(880);
    expect(vibrate).toHaveBeenCalledWith([40]);
  });

  it('plays a low long tone and a double buzz on error', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('error');
    expect(FakeAudioContext.last?.oscillators[0].frequency.value).toBe(220);
    expect(vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('reuses one AudioContext across calls', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('success');
    const first = FakeAudioContext.last;
    feedback('error');
    expect(FakeAudioContext.last).toBe(first);
    expect(first?.oscillators).toHaveLength(2);
  });

  it('stays silent instead of throwing when the device has no vibration (iOS)', async () => {
    vi.stubGlobal('navigator', {});
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('success')).not.toThrow();
    expect(FakeAudioContext.last?.oscillators).toHaveLength(1);
  });

  it('stays silent instead of throwing when audio is blocked', async () => {
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          throw new Error('not allowed');
        }
      },
    });
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('error')).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('does nothing at all on the server', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('success')).not.toThrow();
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/ui/feedback.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/feedback'`.

- [ ] **Step 4: Write `src/lib/feedback.ts`**

```ts
/**
 * Field feedback: a short tone plus a vibration, so a packer holding a box knows
 * an action landed without reading the screen (spec §5.5).
 * Every call is best-effort — audio and vibration are both routinely unavailable
 * on a real phone, and neither may ever break the screen that called it.
 */

export type FeedbackKind = 'success' | 'error';

export const FEEDBACK_PATTERNS: Record<FeedbackKind, { hz: number; ms: number; vibrate: number[] }> = {
  success: { hz: 880, ms: 120, vibrate: [40] },
  error: { hz: 220, ms: 320, vibrate: [80, 60, 80] },
};

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor });
  const Impl = Ctor.AudioContext ?? Ctor.webkitAudioContext;
  if (!Impl) return null;
  try {
    ctx = new Impl();
  } catch {
    // Audio is blocked (no user gesture yet, or a locked-down browser) — vibration still works.
    ctx = null;
  }
  return ctx;
}

function tone(hz: number, ms: number): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + ms / 1000);
  } catch {
    // Ignore: a silent phone is a nuisance, a thrown error is a broken screen.
  }
}

function buzz(pattern: number[]): void {
  if (typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore: iOS Safari has no vibration API at all.
  }
}

export function feedback(kind: FeedbackKind): void {
  const p = FEEDBACK_PATTERNS[kind];
  buzz(p.vibrate);
  tone(p.hz, p.ms);
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/ui/feedback.test.ts
```

Expected: PASS, all six.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feedback.ts tests/field/ui/feedback.test.ts
git commit -m "feat(ui): success/error sound and vibration for field screens"
```

Merge and tell P4 in chat: *"`import { feedback } from '@/lib/feedback'` is on main — `feedback('success')` / `feedback('error')`."*

---

### Task 3: UI kit part 1 — surfaces, buttons, messages, and the action hook

The presentational half of the kit plus the one piece of shared behaviour every screen needs: turning a thrown error into a Hebrew sentence on the screen.

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Banner.tsx`, `src/components/ui/Spinner.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/ui/errors.ts`, `src/components/ui/useAction.ts`
- Test: `tests/field/ui/errors.test.ts`

**Interfaces:**
- Consumes: `ApiClientError` from `@/lib/api/client`; `feedback` from `@/lib/feedback`.
- Produces:
  - `<Button variant?: 'primary' | 'secondary' | 'quiet' size?: 'lg' | 'md' busy?: boolean />` — a normal `<button>` otherwise
  - `<Card className?: string>{children}</Card>`
  - `<Banner tone: 'info' | 'ok' | 'warn' | 'danger' title?: string>{children}</Banner>`
  - `<Spinner />`
  - `<EmptyState title: string body?: string action?: ReactNode />`
  - `describeError(e: unknown): { messageHe: string; redirectTo: string | null }`
  - `useAction(): { busy: boolean; error: string | null; setError: (m: string | null) => void; run: <T>(fn: () => Promise<T>, onOk?: (value: T) => void) => Promise<T | undefined> }`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/ui-kit-1
```

- [ ] **Step 2: Write the failing test** — `tests/field/ui/errors.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { describeError } from '@/components/ui/errors';

describe('describeError', () => {
  it('shows the server Hebrew message for a domain error', () => {
    const e = new ApiClientError('ROOM_NOT_MAPPED', 'יש לסיים את המיפוי', 409);
    expect(describeError(e)).toEqual({ messageHe: 'יש לסיים את המיפוי', redirectTo: null });
  });

  it('sends an expired session back to sign-in', () => {
    const e = new ApiClientError('UNAUTHENTICATED', 'יש להתחבר מחדש', 401);
    expect(describeError(e)).toEqual({ messageHe: 'יש להתחבר מחדש', redirectTo: '/login' });
  });

  it('falls back to a Hebrew network message for a plain error', () => {
    expect(describeError(new Error('fetch failed'))).toEqual({
      messageHe: 'אין תקשורת עם השרת, נסו שוב',
      redirectTo: null,
    });
  });

  it('never leaks a non-Error throw to the screen', () => {
    expect(describeError('boom').messageHe).toBe('אין תקשורת עם השרת, נסו שוב');
    expect(describeError(undefined).messageHe).toBe('אין תקשורת עם השרת, נסו שוב');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/ui/errors.test.ts
```

Expected: FAIL with `Cannot find module '@/components/ui/errors'`.

- [ ] **Step 4: Write `src/components/ui/errors.ts`**

```ts
import { ApiClientError } from '@/lib/api/client';

export interface ActionFailure {
  /** Hebrew, safe to render straight onto a field screen. */
  messageHe: string;
  /** Where the user must be sent for this to be recoverable, or null to stay put. */
  redirectTo: string | null;
}

const NETWORK_FAILURE = 'אין תקשורת עם השרת, נסו שוב';

export function describeError(e: unknown): ActionFailure {
  if (e instanceof ApiClientError) {
    return { messageHe: e.messageHe, redirectTo: e.code === 'UNAUTHENTICATED' ? '/login' : null };
  }
  // A thrown string, a TypeError from fetch, an aborted request — all the same to a packer.
  return { messageHe: NETWORK_FAILURE, redirectTo: null };
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/ui/errors.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/ui/useAction.ts`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { feedback } from '@/lib/feedback';
import { describeError } from './errors';

/**
 * One busy flag, one Hebrew error line, one sound per user action.
 * Every write on a field screen goes through `run` so no screen invents its own
 * error handling and no thrown error reaches React as a blank page.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, onOk?: (value: T) => void): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const value = await fn();
        feedback('success');
        onOk?.(value);
        return value;
      } catch (e) {
        const failure = describeError(e);
        setError(failure.messageHe);
        feedback('error');
        if (failure.redirectTo) router.push(failure.redirectTo);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, setError, run };
}
```

- [ ] **Step 7: Write `src/components/ui/Button.tsx`**

```tsx
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
```

- [ ] **Step 8: Write `src/components/ui/Card.tsx`, `Spinner.tsx`, `Banner.tsx` and `EmptyState.tsx`**

```tsx
// src/components/ui/Card.tsx
export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-card border border-subtle bg-surface p-4 ${className}`}>{children}</div>;
}
```

```tsx
// src/components/ui/Spinner.tsx
export function Spinner({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-subtle border-t-primary" />
      <span>{label}</span>
    </div>
  );
}
```

```tsx
// src/components/ui/Banner.tsx
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
```

```tsx
// src/components/ui/EmptyState.tsx
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
```

- [ ] **Step 9: Run the whole suite and the build**

```bash
npm test
npm run build
```

Expected: everything green. A `'use client'` component that is never imported still type-checks — the build is the check that matters here.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui tests/field/ui/errors.test.ts
git commit -m "feat(ui): buttons, cards, banners and the shared action hook"
```

---

### Task 4: UI kit part 2 — header, option list, quantity stepper, text field, dialog, status chip

The interactive half. This is the task P4 is waiting on: the option list, the stepper and the dialog are what their load/receive/distribute screens are built from.

**Files:**
- Create: `src/components/ui/logic.ts`, `src/components/ui/AppHeader.tsx`, `src/components/ui/OptionList.tsx`, `src/components/ui/Stepper.tsx`, `src/components/ui/TextField.tsx`, `src/components/ui/Dialog.tsx`, `src/components/ui/StatusChip.tsx`, `src/components/ui/index.ts`
- Test: `tests/field/ui/logic.test.ts`

**Interfaces:**
- Consumes: Task 3's `Button`, `Card`; `statusLabel` from `@/lib/labels`; `PackingUnitStatus` etc. from `@/lib/contracts`.
- Produces:
  - `clamp(value: number, min: number, max: number): number`
  - `statusTone(status: string): 'neutral' | 'info' | 'ok' | 'warn' | 'danger'`
  - `<AppHeader title: string backHref?: string right?: ReactNode />`
  - `<OptionList<T> options: Option<T>[] value: T | null onChange: (v: T) => void />` where `Option<T> = { value: T; label: string; hint?: string | null; disabled?: boolean }`
  - `<Stepper value: number max: number onChange: (n: number) => void label?: string />`
  - `<TextField label: string value: string onChange: (v: string) => void inputMode?: 'text' | 'numeric' maxLength?: number autoFocus?: boolean />`
  - `<Dialog open: boolean title: string onClose?: () => void>{children}</Dialog>`
  - `<StatusChip entityType: string status: string />`
  - `src/components/ui/index.ts` re-exporting everything from Tasks 3 and 4 — other people import `from '@/components/ui'`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/ui-kit-2
```

- [ ] **Step 2: Write the failing test** — `tests/field/ui/logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { clamp, statusTone } from '@/components/ui/logic';

describe('clamp', () => {
  it('keeps a value inside its bounds', () => {
    expect(clamp(3, 0, 5)).toBe(3);
    expect(clamp(-2, 0, 5)).toBe(0);
    expect(clamp(9, 0, 5)).toBe(5);
  });

  it('never returns a fraction or NaN from a typed-in value', () => {
    expect(clamp(2.7, 0, 5)).toBe(2);
    expect(clamp(Number.NaN, 0, 5)).toBe(0);
  });

  it('collapses to the minimum when max is below min (an item with nothing left)', () => {
    expect(clamp(4, 0, 0)).toBe(0);
  });
});

describe('statusTone', () => {
  it('paints the loss statuses red and the shortage statuses amber', () => {
    expect(statusTone('missing')).toBe('danger');
    expect(statusTone('short')).toBe('danger');
    expect(statusTone('distributed_short')).toBe('warn');
  });

  it('paints completed statuses green', () => {
    expect(statusTone('received')).toBe('ok');
    expect(statusTone('distributed')).toBe('ok');
    expect(statusTone('released')).toBe('ok');
  });

  it('paints in-flight statuses as info and everything else neutral', () => {
    expect(statusTone('in_transit')).toBe('info');
    expect(statusTone('open')).toBe('neutral');
    expect(statusTone('something_new')).toBe('neutral');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/ui/logic.test.ts
```

Expected: FAIL with `Cannot find module '@/components/ui/logic'`.

- [ ] **Step 4: Write `src/components/ui/logic.ts`**

```ts
/** Pure helpers shared by the kit. Kept out of the .tsx files so they can be tested in node. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const whole = Math.trunc(value);
  if (max < min) return min;
  return Math.min(Math.max(whole, min), max);
}

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

// One colour language for every status in the system, so a red chip always means loss.
const TONES: Record<string, Tone> = {
  missing: 'danger',
  short: 'danger',
  distributed_short: 'warn',
  received: 'ok',
  distributed: 'ok',
  released: 'ok',
  closed: 'ok',
  in_transit: 'info',
  loading: 'info',
  packing: 'info',
};

export function statusTone(status: string): Tone {
  return TONES[status] ?? 'neutral';
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/ui/logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the components**

```tsx
// src/components/ui/AppHeader.tsx
import Link from 'next/link';

/** White bar, centred title, back/exit affordances top-left (design/design.md). */
export function AppHeader({ title, backHref, right }: { title: string; backHref?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-subtle bg-surface px-4">
      <div className="flex min-w-24 justify-start">
        {backHref ? (
          <Link href={backHref} className="text-link">
            חזרה
          </Link>
        ) : (
          right
        )}
      </div>
      <h1 className="flex-1 text-center text-lg font-bold">{title}</h1>
      <div className="flex min-w-24 justify-end">{backHref ? right : null}</div>
    </header>
  );
}
```

```tsx
// src/components/ui/OptionList.tsx
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
```

Note the row is never `disabled` even when `o.disabled` is set — an unmapped room must stay tappable so the packer sees *why* (`flows/packing_flow.md`: picking an unmapped room is what produces "יש לסיים את המיפוי"). `disabled` is carried on the option so the screen can decide; Task 6 uses `hint` for the reason.

```tsx
// src/components/ui/Stepper.tsx
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
```

```tsx
// src/components/ui/TextField.tsx
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
```

```tsx
// src/components/ui/Dialog.tsx
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
```

```tsx
// src/components/ui/StatusChip.tsx
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
```

- [ ] **Step 7: Write the barrel** — `src/components/ui/index.ts`

```ts
export { AppHeader } from './AppHeader';
export { Banner } from './Banner';
export { Button } from './Button';
export { Card } from './Card';
export { Dialog } from './Dialog';
export { EmptyState } from './EmptyState';
export { OptionList, type Option } from './OptionList';
export { Spinner } from './Spinner';
export { StatusChip } from './StatusChip';
export { Stepper } from './Stepper';
export { TextField } from './TextField';
export { describeError, type ActionFailure } from './errors';
export { clamp, statusTone, type Tone } from './logic';
export { useAction } from './useAction';
```

- [ ] **Step 8: Run the suite and the build**

```bash
npm test
npm run build
```

Expected: green.

- [ ] **Step 9: Commit and hand the kit to P4**

```bash
git add src/components/ui tests/field/ui/logic.test.ts
git commit -m "feat(ui): header, option list, stepper, text field, dialog, status chip"
```

Merge, then post in chat: *"UI kit is on main. `import { AppHeader, Banner, Button, Card, Dialog, EmptyState, OptionList, Spinner, StatusChip, Stepper, TextField, useAction } from '@/components/ui'`. Every write goes through `useAction().run(...)` — it gives you the busy flag, the Hebrew error line and the sound."* This is the ~H4 handover in `docs/generated/plan.md` §2.

---

### Task 5: The field shell and home screen

`/field` currently 404s (P1 Task 5 noted it). This is the screen every role lands on.

**Files:**
- Create: `src/app/field/layout.tsx`, `src/app/field/page.tsx`, `src/app/field/home-actions.ts`
- Test: `tests/field/shell/home-actions.test.ts`

**Interfaces:**
- Consumes: `requirePageActor` from `@/lib/session`; `<RoleSwitcher>` from `@/components/RoleSwitcher`; `ROLE_LABELS` from `@/lib/labels`; Task 3–4 kit.
- Produces: `homeActions(role: Role | null): { primary: FieldAction | null; others: FieldAction[] }` where `FieldAction = { href: string; title: string; body: string }`; the `/field` route and the layout every `/field/**` page renders inside.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/field-shell
```

- [ ] **Step 2: Write the failing test** — `tests/field/shell/home-actions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { FIELD_ACTIONS, homeActions } from '@/app/field/home-actions';

describe('homeActions', () => {
  it('puts the packer straight on the packing action', () => {
    const { primary, others } = homeActions('packer');
    expect(primary?.href).toBe('/field/pack');
    expect(primary?.title).toBe('אריזת ציוד');
    expect(others.map((a) => a.href)).toEqual(['/field/load', '/field/receive', '/field/distribute']);
  });

  it('matches every field role to its own action', () => {
    expect(homeActions('transporter').primary?.href).toBe('/field/load');
    expect(homeActions('unloader').primary?.href).toBe('/field/receive');
    expect(homeActions('distributor').primary?.href).toBe('/field/distribute');
  });

  it('offers a commander every action and singles none out', () => {
    const { primary, others } = homeActions('commander');
    expect(primary).toBeNull();
    expect(others).toEqual(FIELD_ACTIONS);
  });

  it('offers a roleless user every action rather than an empty screen', () => {
    expect(homeActions(null).others).toEqual(FIELD_ACTIONS);
  });

  it('always offers all four actions between primary and others', () => {
    for (const role of ['packer', 'transporter', 'unloader', 'distributor'] as const) {
      const { primary, others } = homeActions(role);
      expect([primary, ...others].filter(Boolean)).toHaveLength(FIELD_ACTIONS.length);
    }
  });
});
```

The last two matter for the demo: five people share four phones and switch roles constantly (spec §1 — anyone may pick any role), so no role may ever be shown a dead end.

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/shell/home-actions.test.ts
```

Expected: FAIL with `Cannot find module '@/app/field/home-actions'`.

- [ ] **Step 4: Write `src/app/field/home-actions.ts`**

```ts
import type { Role } from '@/lib/contracts';

export interface FieldAction {
  href: string;
  title: string;
  body: string;
}

/** The four links of the evacuation chain (spec §2), in chain order. */
export const FIELD_ACTIONS: FieldAction[] = [
  { href: '/field/pack', title: 'אריזת ציוד', body: 'פתיחת אריזה, בחירת פריטים והדפסת מדבקה' },
  { href: '/field/load', title: 'העמסה והובלה', body: 'פתיחת יחידת הובלה וסריקת אריזות' },
  { href: '/field/receive', title: 'קבלת ציוד', body: 'פריקת יחידת הובלה וסריקת האריזות שהגיעו' },
  { href: '/field/distribute', title: 'פיזור ציוד', body: 'סריקת אריזה ופיזור הפריטים בחדר היעד' },
];

const PRIMARY_BY_ROLE: Record<string, string> = {
  packer: '/field/pack',
  transporter: '/field/load',
  unloader: '/field/receive',
  distributor: '/field/distribute',
};

/**
 * Role decides what is put under the packer's thumb — never what they are allowed to do.
 * Demo mode: everyone can reach every action (spec §1).
 */
export function homeActions(role: Role | null): { primary: FieldAction | null; others: FieldAction[] } {
  const href = role ? PRIMARY_BY_ROLE[role] : undefined;
  const primary = FIELD_ACTIONS.find((a) => a.href === href) ?? null;
  return { primary, others: FIELD_ACTIONS.filter((a) => a !== primary) };
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/shell/home-actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/layout.tsx`**

```tsx
import { AppHeader } from '@/components/ui';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { requirePageActor } from '@/lib/session';

// Per-request: the header shows who is signed in.
export const dynamic = 'force-dynamic';

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-page">
      <AppHeader title="המעברה" right={<RoleSwitcher role={actor.role} />} />
      <main className="flex-1 p-4 pb-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/field/page.tsx`**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/labels';
import { requirePageActor } from '@/lib/session';
import { homeActions } from './home-actions';

export const dynamic = 'force-dynamic';

export default async function FieldHome() {
  const actor = await requirePageActor();
  const { primary, others } = homeActions(actor.role);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white">
        שלום {actor.name}
        {actor.role && ` · ${ROLE_LABELS[actor.role]}`}
      </p>

      {primary && (
        <Link href={primary.href} className="block">
          <Card className="border-2 border-primary">
            <p className="text-xl font-bold text-primary">{primary.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{primary.body}</p>
          </Card>
        </Link>
      )}

      {others.length > 0 && (
        <>
          <p className="mt-2 text-sm text-white/80">{primary ? 'פעולות נוספות' : 'בחרו פעולה'}</p>
          <div className="flex flex-col gap-3">
            {others.map((action) => (
              <Link key={action.href} href={action.href} className="block">
                <Card>
                  <p className="font-bold">{action.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{action.body}</p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Look at it**

```bash
npm run dev
```

With `AUTH_BYPASS=1` in `.env`, open `http://localhost:3000/field` at 390×844. Expected: purple page, white header with the role dropdown and `יציאה`, one outlined primary card (the dev user is a `commander`, so no primary — switch the role dropdown to `אורז` and the packing card jumps to the top). `/field/load` and friends 404 until P4 lands — expected.

- [ ] **Step 9: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field tests/field/shell
git commit -m "feat(field): field shell and role-aware home screen"
```

---

### Task 6: Pack step 1 — group → room → unit type → open the box

`flows/packing_flow.md` nodes B through H. The screen that decides *where* a box is being packed.

**Files:**
- Create: `src/app/field/pack/page.tsx`, `src/app/field/pack/PackStart.tsx`, `src/app/field/pack/logic.ts`
- Test: `tests/field/pack/logic.test.ts`

**Interfaces:**
- Consumes: `api.groups()`, `api.rooms(groupId)`, `api.openPackingUnit(req)` from `@/lib/api/client`; `PACKABLE_ROOM_STATUSES`, `PACKING_UNIT_TYPES` from `@/lib/contracts`; `PACKING_UNIT_TYPE_LABELS`, `ROOM_STATUS_LABELS` from `@/lib/labels`; Task 3–4 kit.
- Produces: `isRoomPackable(status: RoomStatus): boolean`, `roomHintHe(room: RoomDTO): string | null`, `needsItems(type: PackingUnitType): boolean`; the `/field/pack` route, which accepts an optional `?roomId=` to preselect a room (Task 8's "pack another box in this room" uses it).

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/pack-start
```

- [ ] **Step 2: Write the failing test** — `tests/field/pack/logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { RoomDTO } from '@/lib/contracts';
import { isRoomPackable, needsItems, roomHintHe } from '@/app/field/pack/logic';

const room = (status: RoomDTO['status'], roomManager: string | null = 'רס"ל דנה כהן'): RoomDTO => ({
  id: 1,
  groupId: 1,
  description: 'חדר 101',
  status,
  roomManager,
});

describe('isRoomPackable', () => {
  it('allows the two statuses that finished mapping', () => {
    expect(isRoomPackable('done')).toBe(true);
    expect(isRoomPackable('packing')).toBe(true);
  });

  it('blocks a room that has not finished mapping', () => {
    expect(isRoomPackable('waiting')).toBe(false);
    expect(isRoomPackable('inProgress')).toBe(false);
  });

  it('blocks a room that is already finished', () => {
    expect(isRoomPackable('closed')).toBe(false);
    expect(isRoomPackable('awaiting_disposal')).toBe(false);
  });
});

describe('roomHintHe', () => {
  it('names the room manager when the room can be packed', () => {
    expect(roomHintHe(room('done'))).toBe('אחראי חדר: רס"ל דנה כהן');
  });

  it('says nothing when a packable room has no manager on file', () => {
    expect(roomHintHe(room('done', null))).toBeNull();
  });

  it('explains an unmapped room in the words the flow specifies', () => {
    expect(roomHintHe(room('waiting'))).toBe('יש לסיים את המיפוי');
    expect(roomHintHe(room('inProgress'))).toBe('יש לסיים את המיפוי');
  });

  it('explains a room that is already done with its own status label', () => {
    expect(roomHintHe(room('closed'))).toBe('חדר סגור');
    expect(roomHintHe(room('awaiting_disposal'))).toBe('ממתין לגריטה');
  });
});

describe('needsItems', () => {
  it('skips the contents step only for a personal carton', () => {
    expect(needsItems('personal_carton')).toBe(false);
    expect(needsItems('professional_carton')).toBe(true);
    expect(needsItems('pallet')).toBe(true);
    expect(needsItems('trolley')).toBe(true);
    expect(needsItems('loose')).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: FAIL with `Cannot find module '@/app/field/pack/logic'`.

- [ ] **Step 4: Write `src/app/field/pack/logic.ts`** (Tasks 7 and 8 append to this file)

```ts
import { PACKABLE_ROOM_STATUSES, type PackingUnitType, type RoomDTO, type RoomStatus } from '@/lib/contracts';
import { ROOM_STATUS_LABELS } from '@/lib/labels';

/** A room may be packed once Phase A mapping finished (contracts: PACKABLE_ROOM_STATUSES). */
export function isRoomPackable(status: RoomStatus): boolean {
  return PACKABLE_ROOM_STATUSES.includes(status);
}

/**
 * The second line on a room row: who is responsible for it, or why it cannot be packed.
 * flows/packing_flow.md node F fixes the unmapped wording — it must match the server's
 * ROOM_NOT_MAPPED message so the packer reads the same sentence either way.
 */
export function roomHintHe(room: RoomDTO): string | null {
  if (isRoomPackable(room.status)) {
    return room.roomManager ? `אחראי חדר: ${room.roomManager}` : null;
  }
  if (room.status === 'waiting' || room.status === 'inProgress') return 'יש לסיים את המיפוי';
  return ROOM_STATUS_LABELS[room.status];
}

/** A personal carton is sealed without listing its contents (spec §5.1). */
export function needsItems(type: PackingUnitType): boolean {
  return type !== 'personal_carton';
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: PASS, all eleven.

- [ ] **Step 6: Write `src/app/field/pack/page.tsx`**

```tsx
import { PackStart } from './PackStart';

export const dynamic = 'force-dynamic';

// Next.js 15: searchParams is async.
export default async function PackPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string }>;
}) {
  const { roomId } = await searchParams;
  const parsed = Number(roomId);
  return <PackStart initialRoomId={Number.isInteger(parsed) && parsed > 0 ? parsed : null} />;
}
```

- [ ] **Step 7: Write `src/app/field/pack/PackStart.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, OptionList, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPES, type PackingUnitType } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { isRoomPackable, roomHintHe } from './logic';

export function PackStart({ initialRoomId }: { initialRoomId: number | null }) {
  const router = useRouter();
  const { busy, error, setError, run } = useAction();

  const [groupId, setGroupId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(initialRoomId);
  const [type, setType] = useState<PackingUnitType | null>(null);

  const groups = useSWR('groups', api.groups);
  const rooms = useSWR(groupId ? ['rooms', groupId] : null, () => api.rooms(groupId as number));

  // Arriving with ?roomId= (from "pack another box"): find its group so the room list loads.
  useEffect(() => {
    if (initialRoomId === null || groupId !== null || !groups.data) return;
    void (async () => {
      for (const g of groups.data) {
        const list = await api.rooms(g.id);
        if (list.some((r) => r.id === initialRoomId)) {
          setGroupId(g.id);
          return;
        }
      }
    })();
  }, [initialRoomId, groupId, groups.data]);

  const room = rooms.data?.find((r) => r.id === roomId) ?? null;
  const roomBlocked = room !== null && !isRoomPackable(room.status);

  function open() {
    if (roomId === null || type === null) return;
    void run(
      () => api.openPackingUnit({ sourceRoomId: roomId, type }),
      (unit) => router.push(`/field/pack/${unit.id}`),
    );
  }

  if (groups.error) return <Banner tone="danger">{describeError(groups.error).messageHe}</Banner>;
  if (!groups.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-2 font-bold">מדור</p>
        <OptionList
          options={groups.data.map((g) => ({ value: g.id, label: g.name }))}
          value={groupId}
          onChange={(id) => {
            setGroupId(id);
            setRoomId(null);
            setError(null);
          }}
        />
      </Card>

      {groupId !== null && (
        <Card>
          <p className="mb-2 font-bold">חדר</p>
          {rooms.error ? (
            <Banner tone="danger">{describeError(rooms.error).messageHe}</Banner>
          ) : !rooms.data ? (
            <Spinner />
          ) : (
            <OptionList
              options={rooms.data.map((r) => ({
                value: r.id,
                label: r.description,
                hint: roomHintHe(r),
                disabled: !isRoomPackable(r.status),
              }))}
              value={roomId}
              onChange={(id) => {
                setRoomId(id);
                setError(null);
              }}
            />
          )}
        </Card>
      )}

      {roomBlocked && <Banner tone="warn" title="לא ניתן לארוז מחדר זה">{roomHintHe(room)}</Banner>}

      {roomId !== null && !roomBlocked && (
        <Card>
          <p className="mb-2 font-bold">סוג יחידת אריזה</p>
          <OptionList
            options={PACKING_UNIT_TYPES.map((t) => ({ value: t, label: PACKING_UNIT_TYPE_LABELS[t] }))}
            value={type}
            onChange={setType}
          />
        </Card>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={open} busy={busy} disabled={roomId === null || roomBlocked || type === null}>
        פתיחת אריזה
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Walk the screen**

```bash
npm run dev
```

At `http://localhost:3000/field/pack` (phone viewport): pick `ענף תקשוב — מדור מערכות` → the room list shows `חדר 101` and `חדר 102` with their managers, and `חדר 103` with `יש לסיים את המיפוי`. Tap `חדר 103` → the amber banner appears and `פתיחת אריזה` stays disabled. Tap `חדר 101` → pick `קרטון מקצועי` → `פתיחת אריזה` → you land on `/field/pack/1`, which 404s until Task 7. Confirm the box exists:

```bash
npx prisma studio
```

Expected: one `packing_units` row, status `open`, and `rooms.status` for room 101 now `packing`.

- [ ] **Step 9: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/pack tests/field/pack
git commit -m "feat(pack): pick group, room and unit type, then open a box"
```

---

### Task 7: Pack step 2 — the contents of the box

The zero-loss step. Everything about quantities lives here, including Review Focus items 1–3.

**Files:**
- Create: `src/app/field/pack/[unitId]/page.tsx`, `src/app/field/pack/[unitId]/PackUnit.tsx`, `src/app/field/pack/[unitId]/ItemPicker.tsx`
- Modify: `src/app/field/pack/logic.ts` (append), `tests/field/pack/logic.test.ts` (append)

**Interfaces:**
- Consumes: Task 6's `needsItems`; `api.packableItems(roomId)` for the list and `api.setPackingUnitItems(id, req)` to save; Task 3–4 kit.
- Produces:
  - `itemRows(packable: PackableItemDTO[], saved: PackingUnitItemDTO[]): ItemRow[]` where `ItemRow = { mappingReportId: number; name: string; serial: string | null; status: 'transfer' | 'salvage' | null; max: number; initial: number }`
  - `draftToRequest(draft: Record<number, number>): SetItemsReq`
  - `draftTotal(draft: Record<number, number>): number`
  - `canLeaveContents(type: PackingUnitType, draft: Record<number, number>): boolean`

**A note before you start.** There is no `GET /api/packing-units/:id` in the route table (`docs/generated/plan.md` §5.8) — boxes are read by code, and an open box has no code yet. So this page does not re-read the box: `/field/pack/[unitId]` is reached from Task 6 with the box just opened, and the page loads the room's packable items plus whatever `PUT /items` returns. To survive a refresh it keeps the opened box's DTO in `sessionStorage` under `pack:<unitId>`; if that is gone, it shows a Hebrew message and a link back to `/field/pack`. `// TODO: a GET /api/packing-units/:id would make this unnecessary — ask P1/P2 if there is time.`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/pack-contents
```

- [ ] **Step 2: Append the failing tests to `tests/field/pack/logic.test.ts`**

```ts
import type { PackableItemDTO, PackingUnitItemDTO } from '@/lib/contracts';
import { canLeaveContents, draftToRequest, draftTotal, itemRows } from '@/app/field/pack/logic';

const packable = (mappingReportId: number, name: string, remaining: number, status: 'transfer' | 'salvage' = 'transfer'): PackableItemDTO => ({
  mappingReportId,
  name,
  serial: null,
  status,
  remaining,
});

const saved = (id: number, mappingReportId: number, name: string, quantity: number): PackingUnitItemDTO => ({
  id,
  mappingReportId,
  name,
  serial: null,
  quantity,
  distributedQuantity: 0,
  itemStatus: 'packed',
});

describe('itemRows', () => {
  it('offers everything remaining in the room when the box is empty', () => {
    const rows = itemRows([packable(10, 'מחשב נייד', 2), packable(11, 'מסך', 1, 'salvage')], []);
    expect(rows).toEqual([
      { mappingReportId: 10, name: 'מחשב נייד', serial: null, status: 'transfer', max: 2, initial: 0 },
      { mappingReportId: 11, name: 'מסך', serial: null, status: 'salvage', max: 1, initial: 0 },
    ]);
  });

  // Review Focus 1: the server already subtracted this box's own rows.
  it('adds this box own saved quantity back onto the maximum', () => {
    const rows = itemRows([packable(10, 'מחשב נייד', 1)], [saved(5, 10, 'מחשב נייד', 1)]);
    expect(rows[0]).toMatchObject({ max: 2, initial: 1 });
  });

  // Review Focus 1: at remaining 0 the server stops listing the item entirely.
  it('still lists an item whose whole remaining quantity is already in this box', () => {
    const rows = itemRows([packable(11, 'מסך', 1)], [saved(5, 10, 'מחשב נייד', 2)]);
    expect(rows.map((r) => r.mappingReportId).sort()).toEqual([10, 11]);
    const laptop = rows.find((r) => r.mappingReportId === 10);
    expect(laptop).toMatchObject({ max: 2, initial: 2, name: 'מחשב נייד', status: null });
  });

  it('sorts by name so the screen order never jumps between visits', () => {
    const rows = itemRows([packable(11, 'מסך', 1), packable(10, 'כיסא', 1)], []);
    expect(rows.map((r) => r.name)).toEqual(['כיסא', 'מסך']);
  });

  it('returns nothing for a room with nothing left to pack', () => {
    expect(itemRows([], [])).toEqual([]);
  });
});

describe('draftToRequest', () => {
  it('sends only the items the packer actually put in the box', () => {
    expect(draftToRequest({ 10: 2, 11: 0, 12: 1 })).toEqual({
      items: [
        { mappingReportId: 10, quantity: 2 },
        { mappingReportId: 12, quantity: 1 },
      ],
    });
  });

  it('sends an empty list when the box was emptied', () => {
    expect(draftToRequest({ 10: 0 })).toEqual({ items: [] });
  });
});

describe('draftTotal', () => {
  it('counts every unit in the box', () => {
    expect(draftTotal({ 10: 2, 11: 0, 12: 3 })).toBe(5);
    expect(draftTotal({})).toBe(0);
  });
});

describe('canLeaveContents', () => {
  // Review Focus 3: the server rejects an empty non-personal box with
  // "יש לבחור פריטים לאריזה" — never let the packer walk into that.
  it('requires at least one item in a non-personal box', () => {
    expect(canLeaveContents('professional_carton', {})).toBe(false);
    expect(canLeaveContents('professional_carton', { 10: 0 })).toBe(false);
    expect(canLeaveContents('professional_carton', { 10: 1 })).toBe(true);
  });

  it('lets a personal carton through with no contents at all', () => {
    expect(canLeaveContents('personal_carton', {})).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: FAIL — `itemRows` and the other three are not exported yet.

- [ ] **Step 4: Append to `src/app/field/pack/logic.ts`**

Merge the new types into the file's existing `import type { ... } from '@/lib/contracts'` line rather than adding a second import from the same module — the file ends up importing `ClosePackingUnitReq`, `ClosePackingUnitResult`, `PackableItemDTO`, `PackingUnitDTO`, `PackingUnitItemDTO`, `PackingUnitType`, `RoomDTO`, `RoomStatus`, `SetItemsReq` by the end of Task 9.

```ts
import type { PackableItemDTO, PackingUnitItemDTO, SetItemsReq } from '@/lib/contracts';

export interface ItemRow {
  mappingReportId: number;
  name: string;
  serial: string | null;
  /** null when the row comes only from the box's own contents — the mapping status is not on that DTO. */
  status: 'transfer' | 'salvage' | null;
  max: number;
  initial: number;
}

/**
 * Merges what the room still has with what this box already holds.
 *
 * GET /api/rooms/:id/packable-items subtracts *every* box's contents, this one included,
 * and drops an item once nothing remains. Both are right for a fresh box and wrong for a
 * box being edited, so the box's own rows are added back onto the maximum, and an item
 * that vanished from the room list because it is all in this box is re-added.
 */
export function itemRows(packable: PackableItemDTO[], saved: PackingUnitItemDTO[]): ItemRow[] {
  const mine = new Map(saved.map((s) => [s.mappingReportId, s]));
  const rows: ItemRow[] = packable.map((p) => {
    const own = mine.get(p.mappingReportId);
    return {
      mappingReportId: p.mappingReportId,
      name: p.name,
      serial: p.serial,
      status: p.status,
      max: p.remaining + (own?.quantity ?? 0),
      initial: own?.quantity ?? 0,
    };
  });

  const listed = new Set(rows.map((r) => r.mappingReportId));
  for (const own of saved) {
    if (listed.has(own.mappingReportId)) continue;
    rows.push({
      mappingReportId: own.mappingReportId,
      name: own.name,
      serial: own.serial,
      status: null,
      max: own.quantity,
      initial: own.quantity,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function draftToRequest(draft: Record<number, number>): SetItemsReq {
  return {
    items: Object.entries(draft)
      .filter(([, quantity]) => quantity > 0)
      .map(([mappingReportId, quantity]) => ({ mappingReportId: Number(mappingReportId), quantity })),
  };
}

export function draftTotal(draft: Record<number, number>): number {
  return Object.values(draft).reduce((sum, n) => sum + n, 0);
}

/** A non-personal box with nothing in it is rejected by the server — block it on the phone. */
export function canLeaveContents(type: PackingUnitType, draft: Record<number, number>): boolean {
  return !needsItems(type) || draftTotal(draft) > 0;
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: PASS, all of them.

- [ ] **Step 6: Write `src/app/field/pack/[unitId]/page.tsx`**

```tsx
import { PackUnit } from './PackUnit';

export const dynamic = 'force-dynamic';

export default async function PackUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  return <PackUnit unitId={Number(unitId)} />;
}
```

- [ ] **Step 7: Write `src/app/field/pack/[unitId]/ItemPicker.tsx`**

```tsx
'use client';

import { Card, EmptyState, Stepper } from '@/components/ui';
import { MAPPING_STATUS_LABELS } from '@/lib/labels';
import type { ItemRow } from '../logic';

export function ItemPicker({
  rows,
  draft,
  onChange,
}: {
  rows: ItemRow[];
  draft: Record<number, number>;
  onChange: (mappingReportId: number, quantity: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="אין פריטים לאריזה בחדר הזה"
        body="כל הפריטים שמסומנים כעוברים או כהנצלה כבר נארזו. אפשר לחזור ולבחור חדר אחר."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={row.mappingReportId}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.name}</p>
              <p className="text-sm text-ink-muted">
                {row.serial && `מק"ט ${row.serial} · `}
                {row.status ? MAPPING_STATUS_LABELS[row.status] : 'בתוך האריזה'}
              </p>
            </div>
            <Stepper
              label={row.name}
              value={draft[row.mappingReportId] ?? 0}
              max={row.max}
              onChange={(n) => onChange(row.mappingReportId, n)}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Write `src/app/field/pack/[unitId]/PackUnit.tsx`** (Task 8 extends this file with the destination step)

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { canLeaveContents, draftToRequest, draftTotal, itemRows, needsItems } from '../logic';
import { ItemPicker } from './ItemPicker';

/**
 * The open box survives a refresh in sessionStorage — there is no GET /api/packing-units/:id
 * and an open box has no code to look it up by.
 * // TODO: drop this once a read-by-id route exists.
 */
const key = (unitId: number) => `pack:${unitId}`;

function readCachedUnit(unitId: number): PackingUnitDTO | null {
  try {
    const raw = sessionStorage.getItem(key(unitId));
    return raw ? (JSON.parse(raw) as PackingUnitDTO) : null;
  } catch {
    return null;
  }
}

export function cacheUnit(unit: PackingUnitDTO): void {
  try {
    sessionStorage.setItem(key(unit.id), JSON.stringify(unit));
  } catch {
    // Private mode or a full quota: the packer just cannot refresh. Not worth failing for.
  }
}

export function PackUnit({ unitId }: { unitId: number }) {
  const [unit, setUnit] = useState<PackingUnitDTO | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const { busy, error, run } = useAction();

  useEffect(() => {
    setUnit(readCachedUnit(unitId));
  }, [unitId]);

  // Loaded once per box and never re-fetched — see Conventions #2.
  const packable = useSWR(unit ? ['packable', unit.sourceRoomId] : null, () =>
    api.packableItems((unit as PackingUnitDTO).sourceRoomId),
  );

  const rows = useMemo(() => itemRows(packable.data ?? [], unit?.items ?? []), [packable.data, unit]);

  useEffect(() => {
    if (rows.length === 0) return;
    setDraft(Object.fromEntries(rows.map((r) => [r.mappingReportId, r.initial])));
  }, [rows]);

  if (!unit) return <MissingUnitCard />;

  if (!needsItems(unit.type)) {
    // Personal carton: no contents at all (spec §5.1). Task 8 renders the destination step here.
    return <PersonalCartonNotice unit={unit} />;
  }

  function saveAndContinue() {
    void run(
      () => api.setPackingUnitItems(unitId, draftToRequest(draft)),
      (updated) => {
        setUnit(updated);
        cacheUnit(updated);
        // Task 8 replaces this with a move to the destination step.
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">{unit.sourceRoomName}</p>
        <p className="text-sm text-ink-muted">{PACKING_UNIT_TYPE_LABELS[unit.type]}</p>
      </Card>

      {packable.error ? (
        <Banner tone="danger" title="לא ניתן לטעון את הפריטים">
          {describeError(packable.error).messageHe}
        </Banner>
      ) : !packable.data ? (
        <Spinner />
      ) : (
        <ItemPicker
          rows={rows}
          draft={draft}
          onChange={(mappingReportId, quantity) => setDraft((d) => ({ ...d, [mappingReportId]: quantity }))}
        />
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <p className="mb-2 text-center text-sm text-ink-muted">בתוך האריזה: {draftTotal(draft)} פריטים</p>
        <Button onClick={saveAndContinue} busy={busy} disabled={!canLeaveContents(unit.type, draft)}>
          המשך להזנת יעד
        </Button>
      </div>
    </div>
  );
}

function PersonalCartonNotice({ unit }: { unit: PackingUnitDTO }) {
  return (
    <Card>
      <p className="font-bold">{PACKING_UNIT_TYPE_LABELS[unit.type]}</p>
      <p className="mt-1 text-sm text-ink-muted">בקרטון אישי לא מסמנים פריטים — ממשיכים ישר להזנת היעד.</p>
    </Card>
  );
}

export function MissingUnitCard() {
  return (
    <Card className="text-center">
      <p className="font-bold">האריזה לא נמצאה במכשיר הזה</p>
      <p className="mt-1 text-sm text-ink-muted">יש לפתוח אריזה חדשה ולהמשיך משם.</p>
      <Link href="/field/pack" className="mt-4 inline-block text-link">
        חזרה לבחירת חדר
      </Link>
    </Card>
  );
}
```

- [ ] **Step 9: Walk the screen**

```bash
npm run dev
```

Open a `קרטון מקצועי` in `חדר 101` from `/field/pack`. Expected: `מחשב נייד` (max 2), `מסך` (max 2), `טלפון שולחני` (max 1, labelled `הנצלה`), sorted. Set `מחשב נייד` to 2 with `הכל`, tap `המשך להזנת יעד` → the counter and the saved box update. Now **reload the page**: the steppers come back with `מחשב נייד` at 2 and a maximum of 2, not 0 — that is Review Focus 1 working. Then reload once more after clearing the tab's session storage in devtools → the `האריזה לא נמצאה במכשיר הזה` card.

Open a `קרטון אישי` in the same room → the personal-carton notice, no item list.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/pack tests/field/pack
git commit -m "feat(pack): pick box contents with per-item quantity limits"
```

---

### Task 8: Pack step 3 — destination, close, and the completion screen

`flows/packing_flow.md` nodes K through T: the destination, the 5-digit code, and the room check that decides whether the room just closed.

**Files:**
- Create: `src/app/field/pack/[unitId]/DestinationForm.tsx`, `src/app/field/pack/[unitId]/PackDone.tsx`
- Modify: `src/app/field/pack/[unitId]/PackUnit.tsx` (step state machine), `src/app/field/pack/logic.ts` (append), `tests/field/pack/logic.test.ts` (append)

**Interfaces:**
- Consumes: Task 7's helpers; `api.closePackingUnit(id, req)`; `ClosePackingUnitReq`, `ClosePackingUnitResult` from `@/lib/contracts`.
- Produces:
  - `normalizeDestination(d: { destBuilding: string; destFloor: string; destRoom: string }): ClosePackingUnitReq | null`
  - `completionSummary(result: ClosePackingUnitResult): { title: string; lines: string[]; tone: 'ok' | 'warn'; canPackMore: boolean }`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/pack-close
```

- [ ] **Step 2: Append the failing tests to `tests/field/pack/logic.test.ts`**

```ts
import type { ClosePackingUnitResult, PackingUnitDTO } from '@/lib/contracts';
import { completionSummary, normalizeDestination } from '@/app/field/pack/logic';

const unit = (over: Partial<PackingUnitDTO> = {}): PackingUnitDTO => ({
  id: 1,
  code: '10001',
  type: 'professional_carton',
  status: 'closed',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: 'רס"ל דנה כהן',
  transportUnitId: null,
  packedByName: 'רב"ט ארז כהן',
  closedAt: '2026-09-22T10:00:00.000Z',
  items: [],
  ...over,
});

describe('normalizeDestination', () => {
  it('trims every field before it reaches the server', () => {
    expect(normalizeDestination({ destBuilding: ' בניין 7 ', destFloor: 'קומה 2', destRoom: ' חדר 214' })).toEqual({
      destBuilding: 'בניין 7',
      destFloor: 'קומה 2',
      destRoom: 'חדר 214',
    });
  });

  // Review Focus 4: a box addressed to three spaces cannot be delivered.
  it('rejects a field that is only whitespace', () => {
    expect(normalizeDestination({ destBuilding: '   ', destFloor: 'קומה 2', destRoom: 'חדר 214' })).toBeNull();
    expect(normalizeDestination({ destBuilding: 'בניין 7', destFloor: '', destRoom: 'חדר 214' })).toBeNull();
    expect(normalizeDestination({ destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: '\t' })).toBeNull();
  });
});

describe('completionSummary', () => {
  it('reports the code and the remaining work when the room is still being packed', () => {
    const result: ClosePackingUnitResult = {
      unit: unit(),
      roomCheck: { remaining: 2, disposalRemaining: 0, roomStatus: 'packing' },
    };
    const s = completionSummary(result);
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.lines[0]).toBe('מספר אריזה: 10001');
    expect(s.lines).toContain('נותרו בחדר 2 פריטים לאריזה');
    expect(s).toMatchObject({ tone: 'ok', canPackMore: true });
  });

  it('announces a closed room when the server closed it', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 0, roomStatus: 'closed' },
    });
    expect(s.title).toBe('חדר סגור');
    expect(s.lines).toContain('כל הפריטים בחדר נארזו');
    expect(s.canPackMore).toBe(false);
  });

  it('announces a room waiting for disposal and says how much is left', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 1, roomStatus: 'awaiting_disposal' },
    });
    expect(s.title).toBe('ממתין לגריטה');
    expect(s.lines).toContain('נותרו בחדר 1 פריטים לגריטה');
    expect(s).toMatchObject({ tone: 'warn', canPackMore: false });
  });

  // Review Focus 5: a personal carton gets no room check at all.
  it('never prints a null room check for a personal carton', () => {
    const s = completionSummary({ unit: unit({ type: 'personal_carton' }), roomCheck: null });
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.lines.join(' ')).not.toContain('null');
    expect(s.lines).toEqual(['מספר אריזה: 10001']);
    expect(s.canPackMore).toBe(true);
  });

  // Review Focus 5: nothing left, but the server left the room open.
  it('does not claim the room closed when the server kept it packing', () => {
    const s = completionSummary({
      unit: unit(),
      roomCheck: { remaining: 0, disposalRemaining: 0, roomStatus: 'packing' },
    });
    expect(s.title).toBe('יחידת אריזה הושלמה');
    expect(s.canPackMore).toBe(true);
  });

  it('survives a box that somehow came back without a code', () => {
    const s = completionSummary({ unit: unit({ code: null }), roomCheck: null });
    expect(s.lines[0]).toBe('מספר אריזה: —');
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: FAIL — `normalizeDestination` and `completionSummary` are not exported yet.

- [ ] **Step 4: Append to `src/app/field/pack/logic.ts`**

```ts
import type { ClosePackingUnitReq, ClosePackingUnitResult } from '@/lib/contracts';

/** Trims the destination, or returns null if any part of it is blank. */
export function normalizeDestination(d: {
  destBuilding: string;
  destFloor: string;
  destRoom: string;
}): ClosePackingUnitReq | null {
  const destBuilding = d.destBuilding.trim();
  const destFloor = d.destFloor.trim();
  const destRoom = d.destRoom.trim();
  if (!destBuilding || !destFloor || !destRoom) return null;
  return { destBuilding, destFloor, destRoom };
}

export interface Completion {
  title: string;
  lines: string[];
  tone: 'ok' | 'warn';
  canPackMore: boolean;
}

/**
 * What the packer is told after a box closes (flows/packing_flow.md nodes N–T).
 * The room status is always the server's word — the client never decides a room is closed.
 */
export function completionSummary({ unit, roomCheck }: ClosePackingUnitResult): Completion {
  const lines = [`מספר אריזה: ${unit.code ?? '—'}`];

  // A personal carton skips the room check entirely (spec §5.1).
  if (roomCheck === null) {
    return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
  }

  if (roomCheck.remaining > 0) {
    lines.push(`נותרו בחדר ${roomCheck.remaining} פריטים לאריזה`);
    return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
  }

  if (roomCheck.roomStatus === 'closed') {
    lines.push('כל הפריטים בחדר נארזו');
    return { title: 'חדר סגור', lines, tone: 'ok', canPackMore: false };
  }

  if (roomCheck.roomStatus === 'awaiting_disposal') {
    lines.push('כל הפריטים לאריזה נארזו');
    lines.push(`נותרו בחדר ${roomCheck.disposalRemaining} פריטים לגריטה`);
    return { title: 'ממתין לגריטה', lines, tone: 'warn', canPackMore: false };
  }

  // Nothing remaining but the room is still open — trust the server, offer to keep packing.
  return { title: 'יחידת אריזה הושלמה', lines, tone: 'ok', canPackMore: true };
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/pack/[unitId]/DestinationForm.tsx`**

```tsx
'use client';

import { Banner, Button, Card, TextField } from '@/components/ui';
import { normalizeDestination } from '../logic';

export function DestinationForm({
  value,
  onChange,
  onSubmit,
  busy,
  error,
}: {
  value: { destBuilding: string; destFloor: string; destRoom: string };
  onChange: (next: { destBuilding: string; destFloor: string; destRoom: string }) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const ready = normalizeDestination(value) !== null;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="font-bold">לאן האריזה מגיעה?</p>
        <TextField label="בניין" value={value.destBuilding} onChange={(v) => onChange({ ...value, destBuilding: v })} autoFocus />
        <TextField label="קומה" value={value.destFloor} onChange={(v) => onChange({ ...value, destFloor: v })} />
        <TextField label="חדר" value={value.destRoom} onChange={(v) => onChange({ ...value, destRoom: v })} />
        {!ready && <p className="text-sm text-ink-muted">יש למלא בניין, קומה וחדר</p>}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy} disabled={!ready}>
        סיום אריזה
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/field/pack/[unitId]/PackDone.tsx`** (Task 9 adds the QR label to it)

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button, Card } from '@/components/ui';
import type { ClosePackingUnitResult } from '@/lib/contracts';
import { completionSummary } from '../logic';

export function PackDone({ result }: { result: ClosePackingUnitResult }) {
  const router = useRouter();
  const summary = completionSummary(result);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>

      {/* Task 9 renders <QrLabel unit={result.unit} /> here. */}

      {summary.canPackMore ? (
        <>
          <Button onClick={() => router.push(`/field/pack?roomId=${result.unit.sourceRoomId}`)}>
            אריזה נוספת בחדר זה
          </Button>
          {/* flows/packing_flow.md node U: two ways to stop, and they mean different things to the room. */}
          <Button variant="secondary" onClick={() => router.push('/field/pack')}>
            לא נותרו פריטים לאריזה
          </Button>
          <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
            הפסקה זמנית באריזה
          </Button>
        </>
      ) : (
        <>
          <Card className="text-center text-sm text-ink-muted">אין עוד מה לארוז בחדר הזה.</Card>
          <Button onClick={() => router.push('/field/pack')}>מעבר לחדר אחר</Button>
          <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
            חזרה למסך הראשי
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Turn `PackUnit.tsx` into a three-step machine**

Replace `src/app/field/pack/[unitId]/PackUnit.tsx` entirely with the file below. `PersonalCartonNotice` from Task 7 is gone — a personal carton now starts on the destination step instead of showing a dead-end card.

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { ClosePackingUnitResult, PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import {
  canLeaveContents,
  draftToRequest,
  draftTotal,
  itemRows,
  needsItems,
  normalizeDestination,
} from '../logic';
import { DestinationForm } from './DestinationForm';
import { ItemPicker } from './ItemPicker';
import { PackDone } from './PackDone';

/**
 * The open box survives a refresh in sessionStorage — there is no GET /api/packing-units/:id
 * and an open box has no code to look it up by.
 * // TODO: drop this once a read-by-id route exists.
 */
const key = (unitId: number) => `pack:${unitId}`;

function readCachedUnit(unitId: number): PackingUnitDTO | null {
  try {
    const raw = sessionStorage.getItem(key(unitId));
    return raw ? (JSON.parse(raw) as PackingUnitDTO) : null;
  } catch {
    return null;
  }
}

export function cacheUnit(unit: PackingUnitDTO): void {
  try {
    sessionStorage.setItem(key(unit.id), JSON.stringify(unit));
  } catch {
    // Private mode or a full quota: the packer just cannot refresh. Not worth failing for.
  }
}

type Step = 'contents' | 'destination' | 'done';

export function PackUnit({ unitId }: { unitId: number }) {
  const [unit, setUnit] = useState<PackingUnitDTO | null>(null);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [dest, setDest] = useState({ destBuilding: '', destFloor: '', destRoom: '' });
  const [result, setResult] = useState<ClosePackingUnitResult | null>(null);
  const [step, setStep] = useState<Step>('contents');
  const { busy, error, run } = useAction();

  useEffect(() => {
    const cached = readCachedUnit(unitId);
    setUnit(cached);
    // A personal carton has no contents step at all (spec §5.1).
    if (cached && !needsItems(cached.type)) setStep('destination');
  }, [unitId]);

  // Loaded once per box and never re-fetched — see Conventions #2.
  const packable = useSWR(unit && needsItems(unit.type) ? ['packable', unit.sourceRoomId] : null, () =>
    api.packableItems((unit as PackingUnitDTO).sourceRoomId),
  );

  const rows = useMemo(() => itemRows(packable.data ?? [], unit?.items ?? []), [packable.data, unit]);

  useEffect(() => {
    if (rows.length === 0) return;
    setDraft(Object.fromEntries(rows.map((r) => [r.mappingReportId, r.initial])));
  }, [rows]);

  function saveAndContinue() {
    void run(
      () => api.setPackingUnitItems(unitId, draftToRequest(draft)),
      (updated) => {
        setUnit(updated);
        cacheUnit(updated);
        setStep('destination');
      },
    );
  }

  function close() {
    const req = normalizeDestination(dest);
    if (!req) return;
    void run(
      () => api.closePackingUnit(unitId, req),
      (closed) => {
        setResult(closed);
        setStep('done');
        try {
          sessionStorage.removeItem(key(unitId));
        } catch {
          // Nothing to clean up. The box is closed either way.
        }
      },
    );
  }

  if (!unit) return <MissingUnitCard />;
  if (step === 'done' && result) return <PackDone result={result} />;

  if (step === 'destination') {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <p className="font-bold">{unit.sourceRoomName}</p>
          <p className="text-sm text-ink-muted">
            {PACKING_UNIT_TYPE_LABELS[unit.type]}
            {needsItems(unit.type) && ` · ${draftTotal(draft)} פריטים`}
          </p>
        </Card>
        {needsItems(unit.type) && (
          <Button variant="quiet" size="md" onClick={() => setStep('contents')}>
            חזרה לבחירת פריטים
          </Button>
        )}
        <DestinationForm value={dest} onChange={setDest} onSubmit={close} busy={busy} error={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">{unit.sourceRoomName}</p>
        <p className="text-sm text-ink-muted">{PACKING_UNIT_TYPE_LABELS[unit.type]}</p>
      </Card>

      {packable.error ? (
        <Banner tone="danger" title="לא ניתן לטעון את הפריטים">
          {describeError(packable.error).messageHe}
        </Banner>
      ) : !packable.data ? (
        <Spinner />
      ) : (
        <ItemPicker
          rows={rows}
          draft={draft}
          onChange={(mappingReportId, quantity) => setDraft((d) => ({ ...d, [mappingReportId]: quantity }))}
        />
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <p className="mb-2 text-center text-sm text-ink-muted">בתוך האריזה: {draftTotal(draft)} פריטים</p>
        <Button onClick={saveAndContinue} busy={busy} disabled={!canLeaveContents(unit.type, draft)}>
          המשך להזנת יעד
        </Button>
      </div>
    </div>
  );
}

export function MissingUnitCard() {
  return (
    <Card className="text-center">
      <p className="font-bold">האריזה לא נמצאה במכשיר הזה</p>
      <p className="mt-1 text-sm text-ink-muted">יש לפתוח אריזה חדשה ולהמשיך משם.</p>
      <Link href="/field/pack" className="mt-4 inline-block text-link">
        חזרה לבחירת חדר
      </Link>
    </Card>
  );
}
```

Going back to the contents step and forward again re-sends `PUT /items` — safe by design: P2 measures remaining excluding this box's own rows (`docs/generated/plans/p2-lifecycle.md` Review Focus 2).

- [ ] **Step 9: Walk the whole pack flow twice**

```bash
npm run dev
```

Box 1 — `חדר 101`, `קרטון מקצועי`, `מחשב נייד ×2` + `מסך ×2`, destination `בניין 7 / קומה 2 / חדר 214` → `סיום אריזה`. Expected: `יחידת אריזה הושלמה`, `מספר אריזה: 10001`, `נותרו בחדר 1 פריטים לאריזה`, and the three continue/stop buttons. Try leaving `קומה` blank first: the button stays disabled and the hint shows. Try typing a single space into `בניין`: still disabled — that is Review Focus 4.

Box 2 — `אריזה נוספת בחדר זה` → the room is preselected → `טלפון שולחני ×1` → same destination → expected `חדר סגור` with `כל הפריטים בחדר נארזו` and no "pack another" button.

Box 3 — `חדר 102`, pack `כיסא ×4` and `שולחן ×1` → expected `ממתין לגריטה` with `נותרו בחדר 1 פריטים לגריטה` in amber.

Box 4 — `חדר 201`, `קרטון אישי` → straight to the destination step, closes with `יחידת אריזה הושלמה` and no room-check line.

Reset between attempts:

```bash
npm run demo:reset
```

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/pack tests/field/pack
git commit -m "feat(pack): destination, close and the completion screen"
```

---

### Task 9: The QR label

The artefact the whole rest of the chain scans. The payload is the bare 5-digit code — P4's scanner and `api.packingUnitByCode` both expect exactly that.

**Files:**
- Create: `src/components/QrLabel.tsx`
- Modify: `src/app/field/pack/[unitId]/PackDone.tsx`, `src/app/field/pack/logic.ts` (append), `tests/field/pack/logic.test.ts` (append)

**Interfaces:**
- Consumes: `QRCodeSVG` from `qrcode.react`; `PackingUnitDTO`; the `print-label` / `print-hide` classes from Task 1.
- Produces: `labelLines(unit: PackingUnitDTO): { label: string; value: string }[]`; `<QrLabel unit={PackingUnitDTO} />`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p3/qr-label
```

- [ ] **Step 2: Append the failing test to `tests/field/pack/logic.test.ts`**

`flows/packing_flow.md` note `Nn` lists exactly what belongs on a label; this test is that list.

```ts
import { labelLines } from '@/app/field/pack/logic';

describe('labelLines', () => {
  it('carries everything the flow says a label must show', () => {
    expect(labelLines(unit())).toEqual([
      { label: 'יעד', value: 'בניין 7 · קומה 2 · חדר 214' },
      { label: 'נארז מחדר', value: 'חדר 101' },
      { label: 'מדור', value: 'ענף תקשוב — מדור מערכות' },
      { label: 'אחראי חדר', value: 'רס"ל דנה כהן' },
      { label: 'ארז', value: 'רב"ט ארז כהן' },
    ]);
  });

  it('marks an unknown destination part rather than printing "null"', () => {
    const lines = labelLines(unit({ destFloor: null }));
    expect(lines[0].value).toBe('בניין 7 · — · חדר 214');
  });

  it('drops the room-manager line when nobody is on file', () => {
    expect(labelLines(unit({ roomManager: null })).map((l) => l.label)).toEqual([
      'יעד',
      'נארז מחדר',
      'מדור',
      'ארז',
    ]);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: FAIL — `labelLines` is not exported yet.

- [ ] **Step 4: Append to `src/app/field/pack/logic.ts`**

```ts
import type { PackingUnitDTO } from '@/lib/contracts';

const or = (value: string | null) => value ?? '—';

/** The printed label's text (flows/packing_flow.md note Nn). The code itself is the QR payload. */
export function labelLines(unit: PackingUnitDTO): { label: string; value: string }[] {
  const lines = [
    { label: 'יעד', value: `${or(unit.destBuilding)} · ${or(unit.destFloor)} · ${or(unit.destRoom)}` },
    { label: 'נארז מחדר', value: unit.sourceRoomName },
    { label: 'מדור', value: unit.groupName },
  ];
  if (unit.roomManager) lines.push({ label: 'אחראי חדר', value: unit.roomManager });
  lines.push({ label: 'ארז', value: unit.packedByName });
  return lines;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/pack/logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/QrLabel.tsx`**

```tsx
'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Button, Card } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { labelLines } from '@/app/field/pack/logic';

/**
 * The box label: a QR of the bare 5-digit code plus the code in large type.
 * The payload is the code and nothing else — P4's scanner and
 * GET /api/packing-units/by-code/:code both read it literally.
 */
export function QrLabel({ unit }: { unit: PackingUnitDTO }) {
  if (!unit.code) return null;
  return (
    <>
      <Card className="print-label text-center">
        <QRCodeSVG value={unit.code} size={200} className="mx-auto" />
        <p className="mt-3 text-4xl font-bold tabular-nums tracking-widest">{unit.code}</p>
        <dl className="mt-4 flex flex-col gap-1 text-right text-sm">
          {labelLines(unit).map((line) => (
            <div key={line.label} className="flex justify-between gap-2">
              <dt className="text-ink-muted">{line.label}</dt>
              <dd className="font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Button variant="secondary" className="print-hide" onClick={() => window.print()}>
        הדפסת מדבקה
      </Button>
    </>
  );
}
```

- [ ] **Step 7: Render it on the completion screen**

In `src/app/field/pack/[unitId]/PackDone.tsx`, replace the `{/* Task 9 renders ... */}` comment with:

```tsx
<QrLabel unit={result.unit} />
```

and add `import { QrLabel } from '@/components/QrLabel';`.

- [ ] **Step 8: Check the label, on screen and on paper**

```bash
npm run dev
```

Pack a box through to completion. Expected: a QR, `10001` in large tabular digits, and the five label lines. Then:

1. Scan the QR with a phone camera app. Expected: it reads `10001` — a plain 5-digit string, no URL.
2. Print to PDF from the browser. Expected: the label alone on the page — no header, no buttons, no purple background.

- [ ] **Step 9: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/components/QrLabel.tsx src/app/field/pack tests/field/pack
git commit -m "feat(pack): printable QR label for a closed box"
```

Post in chat: *"Labels are on main. The QR payload is the bare 5-digit code — `10001`, not a URL."*

---

### Task 10: Integration — the pack leg of the demo, end to end (H5 → H20)

P3's screens are the first half of the demo script (`docs/generated/plan.md` §7 step 1). This task is where they stop being four separate merges and start being a thing a commander can watch.

**Files:** `docs/generated/notes.md` (append — P1 owns the file; append a `## P3` section rather than restructuring it).

- [ ] **Step 1: Run the demo's first step on the deployed URL, on a real phone**

`npm run demo:reset` against the deployed database first. Then, on a phone, signed in with Google:

1. `/` → `/field` → `אריזת ציוד`
2. `ענף תקשוב — מדור מערכות` → `חדר 101` → `קרטון מקצועי` → `פתיחת אריזה`
3. `מחשב נייד ×2`, `מסך ×2` → `המשך להזנת יעד`
4. `בניין 7 / קומה 2 / חדר 214` → `סיום אריזה`
5. Label appears, code `10001`. Photograph or print it — P4 needs a scannable label for their leg.
6. `אריזה נוספת בחדר זה` → `טלפון שולחני ×1` → same destination → **`חדר סגור`**

Step 6 is the beat the demo is built around. If it does not say `חדר סגור`, stop and find out whether the client is showing the wrong thing or the server returned the wrong `roomCheck` — the tests in Task 8 pin the client half, so check `roomCheck` in the network tab before opening a bug with P2.

- [ ] **Step 2: Check the things a phone breaks that a laptop does not**

- The purple page background reaches the bottom of the screen with the keyboard open on the destination form.
- The sticky contents footer does not cover the last item row.
- Tapping `+` repeatedly on a stepper does not lose taps.
- `יציאה` and the role dropdown are reachable one-handed.
- The whole flow is legible in direct sunlight — if the `text-ink-muted` grey is not, darken `--color-ink-muted` in `globals.css` and say so in chat.

- [ ] **Step 3: Read every Hebrew string out loud**

Every screen P3 owns, in order. Fix anything that reads like a translation. Two specific things to check, because both come straight from the source flow and the demo audience knows them: `יש לסיים את המיפוי` and `חדר סגור` must appear verbatim.

- [ ] **Step 4: Answer P4's kit questions and take their bug reports**

P4 builds on every component from Tasks 3–4. When they need something the kit lacks, add it to `src/components/ui/**` yourself rather than letting a second button style appear in `src/app/field/load/**`. Additive changes only — never change an existing component's props out from under their screens without a message in chat.

- [ ] **Step 5: Append what you learned to `docs/generated/notes.md`**

```markdown
## P3 — field shell, UI kit, pack flow

- Kit: `@/components/ui` — Button, Card, Banner, Dialog, EmptyState, OptionList, Spinner, StatusChip, Stepper, TextField, AppHeader, useAction.
- Every write goes through `useAction().run(fn, onOk)`: busy flag, Hebrew error line, success/error sound.
- The QR payload is the bare 5-digit code.
- Known shortcut: an open box is cached in `sessionStorage` because there is no `GET /api/packing-units/:id`.
- <anything else the rehearsals turned up>
```

- [ ] **Step 6: Commit**

```bash
git add docs/generated/notes.md
git commit -m "docs: P3 integration notes"
```

---

## What P3 does not build

- **The scanner, and the load / receive / distribute screens.** P4. `/field/load`, `/field/receive` and `/field/distribute` 404 until they land — the home screen links to them from Task 5 on purpose.
- **Anything under `/command`.** P5.
- **Any status change.** Every one of these screens calls `api` and renders what comes back. If a screen seems to need a status write, it needs a lifecycle change: ask P2.
- **Changes to `contracts.ts`, `labels.ts`, `errors.ts`, `api/client.ts` or the Prisma schema.** P1 owns them and they are frozen. If a screen needs a field the DTO lacks, ask in chat — do not work around it by fetching something else.
