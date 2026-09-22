# P4 — Scanning & Chain Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three field flows that move a box after it is packed — load onto a transport unit, receive it at the destination, distribute its contents into a room — on top of a camera scanner with a manual 5-digit fallback.

**Architecture:** One scanning primitive (`src/lib/scan-session.ts` + `Scanner` + `ScanOrType`) shared by all three flows. Each flow is a small step machine in its own route folder — `/field/load`, `/field/receive`, `/field/distribute` — that accumulates scans in client state and sends **exactly one** write at the end. Every decision a flow makes about a scanned code lives in a plain `logic.ts` beside the screen, so it can be unit-tested in the node environment.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, SWR, `html5-qrcode`, Vitest 3 (node environment — no DOM, no React rendering tests).

**Spec:** `docs/generated/2026-09-22-mvp-design.md` (§5.2 load, §5.3 receive, §5.4 distribute, §5.5 field UX rules, §7 errors).
**Master plan (team split, file ownership, frozen contracts):** `docs/generated/plan.md` — §4 ownership, §5 contracts.
**Server semantics you are the client of:** `docs/generated/plans/p2-lifecycle.md` Tasks 5–7. Read their test blocks before Tasks 4, 6 and 8 — they are the authoritative description of what each write accepts and rejects.
**Source material:** `flows/transporting_flow.md`, `flows/unloading_flow.md`, `flows/distributing_flow.md`, `personas/transporter_persona.md`, `personas/unloader_persona.md`, `personas/distributor_persona.md`.

## Global Constraints

See `docs/generated/plan.md` → Global Constraints. The ones that bite this workstream:

- Hackathon MVP: prefer quick and demoable; mark every shortcut with `// TODO:` and a reason.
- Code, identifiers and comments in **English**. Every user-facing string in **Hebrew**. The app is RTL throughout (P3's root layout).
- UI follows P3's design tokens and kit. Never write a hex literal — use `bg-primary`, `bg-surface`, `border-subtle`, `text-ink`, `text-ink-muted`, `text-link`, `rounded-card` and the kit components.
- UI code calls **only** `api` from `@/lib/api/client`. Never `fetch('/api/...')` directly, never a Prisma import in a client component.
- Never redefine a type from `src/lib/contracts.ts`; never hand-write a Hebrew status string that exists in `src/lib/labels.ts`.
- Only `src/lib/lifecycle/**` may write statuses. Every screen here is a caller.
- Box codes are exactly 5 digits (`/^\d{5}$/`). The QR payload is the bare code — P3's label writes exactly that, nothing more.
- Never edit a file you do not own (`docs/generated/plan.md` §4). P4 owns: `src/components/Scanner.tsx`, `src/components/ScanOrType.tsx`, `src/lib/scan-session.ts`, `src/app/field/load/**`, `src/app/field/receive/**`, `src/app/field/distribute/**`, `tests/field/scan/**`, `tests/field/distribute/**`. This plan also adds `src/app/field/format.ts` — a new file in a folder whose other files are P3's; it touches none of them, and Task 4 announces it in team chat.
- Out of scope for the whole MVP: offline mode (the distributor persona asks for it — say so in the demo, do not build it), GPS, UI rendering tests.

## What you depend on, and when

| You need | From | Available at |
|---|---|---|
| Contracts, `api` client, seed data, `requirePageActor` | P1 | Checkpoint A (H1) |
| `feedback()` — scan sound and vibration | P3 Task 2 | ~H2 |
| The UI kit (`@/components/ui`) and the `/field` shell | P3 Tasks 3–5 | ~H4 |
| `POST /api/transport-units`, `.../load`, `.../receive`, `.../distribute` | P2 Tasks 5–7 | Checkpoint B (H5) |
| A printed or on-screen QR label to scan | P3 Task 9 | ~H6 |

**Tasks 1 and 2 depend on none of it** — start there while the kit is still being written. From Task 3 on, rebase onto `main` first. Until P2's routes land you can still build and click through every screen: the reads (`api.packingUnits`, `api.transportUnits`, `api.packingUnitByCode`) arrive with P2 Task 2, well before the writes.

## Conventions this plan commits to

Five decisions the rest of the plan depends on. Read them before Task 1.

1. **The client never sends a code the server can reject.** Every write in this workstream is all-or-nothing: P2 validates the whole list before writing anything, so one stale code at the end of a twenty-box load throws `ILLEGAL_TRANSITION` and leaves the truck untouched — twenty scans of work gone. So a scan is classified *when it is scanned*, against data the client already holds, and anything not in that data is resolved with `api.packingUnitByCode` **before** it is allowed into the accumulated list. By the time a submit button is enabled, every code behind it is known-good.

2. **One submit per flow.** Load, receive and distribute each send exactly one write, at the end (spec §5.3.4, §5.4.4). Everything before it is React state. This is also what makes the recheck steps possible — the flow can still change its mind because nothing has been written.

3. **Pure logic in `logic.ts`, React in `.tsx`.** Vitest runs in the node environment with no jsdom, and spec §8 rules out UI tests. Every rule worth testing — what a scanned code means, what the summary screen says, what goes in the request — is an exported function in a plain module, and the component is a thin renderer over it.

4. **Every scan makes a noise, and a repeat is not an error.** `feedback('success')` when a code is accepted, `feedback('error')` when it is rejected. Re-scanning a box that is already counted is a *friendly no-op* (spec §5.5): success tone, a calm Hebrew line, no change. The unloader persona works in noise and dust and reads the screen rarely — the sound is the interface.

5. **Item quantities start at zero, with a one-tap "פוזר הכל".** The tempting alternative is to prefill every item at its full quantity so the common case is one tap. It is rejected: prefilled quantities mean a distracted distributor confirms a box they never looked into, the shortfall recheck never fires, and equipment is lost silently — the exact failure this system exists to prevent. Zero-by-default with a prominent "everything was distributed" button keeps the speed the distributor persona needs without making loss the default outcome.

## Review Focus

Input classes the spec implies that the happy path never reaches. Each one has a test in the task that owns the code.

1. **`html5-qrcode` decodes the same QR about ten times a second while it is in frame.** Without a guard, holding a box steady produces a stream of duplicate beeps and — in the receive flow — ten `by-code` round trips for one box. A repeat of the same code is accepted only after the camera has been off it for a moment. → Task 1.
2. **No camera.** The page is not on HTTPS, permission was denied, or the device has no camera. Every scan screen must stay fully usable through the 5-digit keypad, and the failure must be one Hebrew line — never a dead screen or a browser error dialog. Four phones and a laptop run this demo; one of them will refuse the camera. → Task 2.
3. **A code scanned at receive that is not on this truck.** It may be a typo, a box still sitting closed at the source, or one already received. Offering "accept as surplus" for any of those sends the entire unload into `NOT_ON_THIS_TRUCK` or `ILLEGAL_TRANSITION` and loses every other box's confirmation with it. The surplus prompt appears only for a box the server will actually accept — one that is `in_transit`. → Task 5.
4. **A box scanned at load that is already on another truck, or was never closed.** P2 rejects the whole load and changes nothing. The client only ever accumulates codes drawn from the live `closed` list, and says plainly why a code was refused. → Task 4.
5. **A box distributed with nothing ticked.** On a box with contents that means `distributed_short` and every item `short`; on a personal carton the identical request means `distributed`. The completion screen must read the status the server returned rather than infer one, and the shortfall warning must appear *before* the submit, not after. → Tasks 7 and 8.

---

### Task 1: The scan session — codes, accumulation, and the decode guard

Pure logic, no React, no dependencies. Everything in this plan is built on it, so it ships first and can start before P3's kit exists.

**Files:**
- Create: `src/lib/scan-session.ts`
- Test: `tests/field/scan/scan-session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CODE_LENGTH: 5`, `REPEAT_SCAN_MS: 1500`
  - `normalizeCode(raw: string): string | null`
  - `addCode(codes: string[], code: string): { codes: string[]; verdict: 'accepted' | 'duplicate' }`
  - `removeCode(codes: string[], code: string): string[]`
  - `shouldAcceptDecode(last: { code: string; at: number } | null, code: string, now: number): boolean`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/scan-session
```

- [ ] **Step 2: Write the failing test** — `tests/field/scan/scan-session.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { addCode, normalizeCode, removeCode, REPEAT_SCAN_MS, shouldAcceptDecode } from '@/lib/scan-session';

describe('normalizeCode', () => {
  it('accepts a bare five-digit code', () => {
    expect(normalizeCode('10001')).toBe('10001');
  });

  // The column is CHAR(5) and a camera decode can carry a trailing newline.
  it('strips whitespace and separators around and inside the digits', () => {
    expect(normalizeCode('  10001 ')).toBe('10001');
    expect(normalizeCode('10001\n')).toBe('10001');
    expect(normalizeCode('1-00-01')).toBe('10001');
  });

  it('refuses anything that is not exactly five digits', () => {
    expect(normalizeCode('1234')).toBeNull();
    expect(normalizeCode('123456')).toBeNull();
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode('abcde')).toBeNull();
  });

  // P3's label encodes the bare code. A URL in the QR is somebody else's sticker.
  it('refuses a URL that happens to contain five digits', () => {
    expect(normalizeCode('https://example.test/box/10001')).toBeNull();
  });
});

describe('addCode', () => {
  it('appends a new code in scan order', () => {
    expect(addCode(['10001'], '10002')).toEqual({ codes: ['10001', '10002'], verdict: 'accepted' });
  });

  it('reports a re-scan as a duplicate and returns the same array', () => {
    const codes = ['10001'];
    const result = addCode(codes, '10001');
    expect(result.verdict).toBe('duplicate');
    // Same reference: a re-scan must not re-render the list under the unloader's thumb.
    expect(result.codes).toBe(codes);
  });
});

describe('removeCode', () => {
  it('takes a code back out and leaves the rest in order', () => {
    expect(removeCode(['10001', '10002', '10003'], '10002')).toEqual(['10001', '10003']);
  });

  it('is a no-op for a code that was never there', () => {
    expect(removeCode(['10001'], '99999')).toEqual(['10001']);
  });
});

describe('shouldAcceptDecode', () => {
  // Review Focus 1: html5-qrcode fires ~10 times a second on the same QR.
  it('accepts the first decode of anything', () => {
    expect(shouldAcceptDecode(null, '10001', 1_000)).toBe(true);
  });

  it('ignores the same code again while the camera is still on it', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10001', 1_100)).toBe(false);
  });

  it('accepts the same code once the camera has been off it', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10001', 1_000 + REPEAT_SCAN_MS)).toBe(true);
  });

  it('accepts a different code immediately', () => {
    expect(shouldAcceptDecode({ code: '10001', at: 1_000 }, '10002', 1_010)).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/scan/scan-session.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/scan-session'`.

If instead you get `Refusing to run tests: DATABASE_URL in .env.test must point at a *test* database`, that is `tests/setup.ts` doing its job — create `.env.test` as described at Checkpoint A. P4's tests never touch the database, but they run through the same setup file.

- [ ] **Step 4: Write `src/lib/scan-session.ts`**

```ts
/**
 * The shared scanning primitive for the load, receive and distribute flows.
 * Pure: no React, no DOM, no network — everything here is decided from arguments.
 */

export const CODE_LENGTH = 5;

/**
 * Turns a camera decode or a typed entry into a box code, or null if it is not one.
 * Separators are stripped so a keypad entry like "1-00-01" still works, but the
 * result must be exactly five digits — a QR carrying a URL is not a box label.
 */
export function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim();
  // Reject before stripping: a URL with digits in it must not become a code.
  if (!/^[\d\s.\-/]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === CODE_LENGTH ? digits : null;
}

/** Adds a code once. Re-scanning an already-counted box is a friendly no-op (spec §5.5). */
export function addCode(
  codes: string[],
  code: string,
): { codes: string[]; verdict: 'accepted' | 'duplicate' } {
  if (codes.includes(code)) return { codes, verdict: 'duplicate' };
  return { codes: [...codes, code], verdict: 'accepted' };
}

export function removeCode(codes: string[], code: string): string[] {
  return codes.filter((c) => c !== code);
}

/** How long the same QR must be out of frame before a repeat counts as a new scan. */
export const REPEAT_SCAN_MS = 1500;

/**
 * html5-qrcode reports a decode on every frame the QR is visible — about ten a second.
 * Without this, one box held steady produces ten beeps and ten lookups.
 */
export function shouldAcceptDecode(
  last: { code: string; at: number } | null,
  code: string,
  now: number,
): boolean {
  if (!last || last.code !== code) return true;
  return now - last.at >= REPEAT_SCAN_MS;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/scan/scan-session.test.ts
```

Expected: PASS, all thirteen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scan-session.ts tests/field/scan/scan-session.test.ts
git commit -m "feat(scan): code normalization, scan accumulation and the decode guard"
```

---

### Task 2: The scanner and its manual fallback

A camera component cannot be unit-tested in a node environment, so this task's real test is a phone. What *can* be pinned automatically is the rule that breaks the build if it is forgotten: `html5-qrcode` must never be imported at module scope.

**Files:**
- Create: `src/components/Scanner.tsx`, `src/components/ScanOrType.tsx`
- Test: `tests/field/scan/scanner-import.test.ts`

**Interfaces:**
- Consumes: `shouldAcceptDecode`, `normalizeCode` from `@/lib/scan-session`; `feedback` from `@/lib/feedback`; `Banner`, `Button`, `Card`, `TextField` from `@/components/ui`.
- Produces:
  - `<Scanner onCode: (code: string) => void onUnavailable: () => void />` — hands out **normalized** codes only
  - `<ScanOrType onCode: (code: string) => void hint?: string />` — camera when there is one, keypad always

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/scanner
```

- [ ] **Step 2: Write the failing test** — `tests/field/scan/scanner-import.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scanner = readFileSync('src/components/Scanner.tsx', 'utf8');

describe('Scanner', () => {
  /**
   * html5-qrcode touches `document` while it is being imported. A top-level import
   * therefore runs during Next's server render and breaks `npm run build` —
   * on the deploy, not on the laptop where it was written.
   */
  it('loads html5-qrcode dynamically, never at module scope', () => {
    expect(scanner).not.toMatch(/^import .*html5-qrcode/m);
    expect(scanner).toContain("await import('html5-qrcode')");
  });

  it('is a client component', () => {
    expect(scanner.startsWith("'use client'")).toBe(true);
  });

  // Review Focus 2: a camera that never starts must not take the screen with it.
  it('handles a camera that refuses to start', () => {
    expect(scanner).toContain('onUnavailable');
    expect(scanner).toMatch(/catch/);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/scan/scanner-import.test.ts
```

Expected: FAIL — `ENOENT` on `src/components/Scanner.tsx`.

- [ ] **Step 4: Write `src/components/Scanner.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui';
import { normalizeCode, shouldAcceptDecode } from '@/lib/scan-session';

const ELEMENT_ID = 'qr-reader';

/**
 * The camera half of scanning. Hands the parent normalized 5-digit codes only —
 * anything else the camera decodes is discarded here, silently, because a passing
 * sticker on a wall is not an error the unloader needs to hear about.
 */
export function Scanner({
  onCode,
  onUnavailable,
}: {
  onCode: (code: string) => void;
  onUnavailable: () => void;
}) {
  // Kept in refs so a re-render of the parent never restarts the camera.
  const onCodeRef = useRef(onCode);
  const onUnavailableRef = useRef(onUnavailable);
  onCodeRef.current = onCode;
  onUnavailableRef.current = onUnavailable;

  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;

    void (async () => {
      try {
        // Dynamic on purpose — see tests/field/scan/scanner-import.test.ts.
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(ELEMENT_ID);
        stop = async () => {
          await scanner.stop();
          scanner.clear();
        };
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decoded) => {
            const now = Date.now();
            if (!shouldAcceptDecode(lastRef.current, decoded, now)) return;
            lastRef.current = { code: decoded, at: now };
            const code = normalizeCode(decoded);
            if (code) onCodeRef.current(code);
          },
          () => {
            // A frame with no QR in it. Normal, and constant. Ignore.
          },
        );
      } catch {
        if (cancelled) return;
        setFailed(true);
        onUnavailableRef.current();
      }
    })();

    return () => {
      cancelled = true;
      void stop?.().catch(() => {
        // The camera is going away with the page anyway.
      });
    };
  }, []);

  if (failed) {
    return <Banner tone="warn">המצלמה אינה זמינה. אפשר להקליד את מספר האריזה.</Banner>;
  }

  return <div id={ELEMENT_ID} className="overflow-hidden rounded-card bg-black" />;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/scan/scanner-import.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/ScanOrType.tsx`**

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Button, Card, TextField } from '@/components/ui';
import { feedback } from '@/lib/feedback';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';
import { Scanner } from './Scanner';

/**
 * Scanning as the field actually gets it: a camera when the device and the
 * connection allow one, and a numeric keypad that is always there (spec §1).
 * Both paths hand the parent the same normalized code.
 */
export function ScanOrType({ onCode, hint }: { onCode: (code: string) => void; hint?: string }) {
  const [cameraOk, setCameraOk] = useState(true);
  const [typed, setTyped] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);

  const onUnavailable = useCallback(() => setCameraOk(false), []);

  function submitTyped() {
    const code = normalizeCode(typed);
    if (!code) {
      feedback('error');
      setTypeError(`יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות`);
      return;
    }
    setTyped('');
    setTypeError(null);
    onCode(code);
  }

  return (
    <Card className="flex flex-col gap-3">
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {cameraOk && <Scanner onCode={onCode} onUnavailable={onUnavailable} />}
      <TextField
        label="מספר אריזה"
        value={typed}
        onChange={(v) => {
          setTyped(v);
          setTypeError(null);
        }}
        inputMode="numeric"
        maxLength={CODE_LENGTH}
      />
      {typeError && <p className="text-sm text-danger">{typeError}</p>}
      <Button variant="secondary" size="md" onClick={submitTyped} disabled={typed.length === 0}>
        אישור מספר
      </Button>
    </Card>
  );
}
```

- [ ] **Step 7: Prove the camera works, on a phone**

The camera needs HTTPS or `localhost`; a phone hitting your laptop's LAN address gets neither, so use the deployed URL (P1 Task 6) once it exists. Until then, test the camera on the laptop at `http://localhost:3000` with a QR on screen.

There is nothing to point the scanner at until a screen uses it, so drop a throwaway page in at `src/app/field/load/page.tsx` for this step — Task 3 replaces it:

```tsx
'use client';

import { useState } from 'react';
import { ScanOrType } from '@/components/ScanOrType';

export default function ScanProbe() {
  const [codes, setCodes] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-4">
      <ScanOrType onCode={(c) => setCodes((prev) => [...prev, c])} hint="בדיקת סורק" />
      <pre className="rounded-card bg-surface p-4">{codes.join('\n')}</pre>
    </div>
  );
}
```

```bash
npm run dev
```

At `/field/load`, check all four:

1. The camera preview appears after the permission prompt.
2. Pointing it at a QR containing `10001` appends `10001` — **once**, not ten times, while you hold it there. That is Review Focus 1 working.
3. Denying the camera permission (or opening the page over plain HTTP from a phone) shows `המצלמה אינה זמינה` and the keypad still works.
4. Typing `10001` and pressing `אישור מספר` appends the code; typing `100` and pressing it gives the Hebrew hint and the error tone.

- [ ] **Step 8: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/components/Scanner.tsx src/components/ScanOrType.tsx src/app/field/load tests/field/scan
git commit -m "feat(scan): camera scanner with a manual five-digit fallback"
```

---

### Task 3: Load step 1 — open a transport unit

`flows/transporting_flow.md` nodes Y through AB. From here on, rebase onto `main` first so you have P3's kit.

**Files:**
- Create: `src/app/field/load/LoadStart.tsx`, `src/app/field/load/logic.ts`, `src/app/field/format.ts`
- Modify: `src/app/field/load/page.tsx` (replace Task 2's probe)
- Test: `tests/field/scan/load-logic.test.ts`, `tests/field/scan/format.test.ts`

**Interfaces:**
- Consumes: `api.groups()`, `api.transportUnits('loading')`, `api.createTransportUnit(req)`; `TRANSPORT_TYPES`, `CreateTransportReq`, `TransportType` from `@/lib/contracts`; `TRANSPORT_TYPE_LABELS` from `@/lib/labels`; P3's kit.
- Produces:
  - `formatHeDateTime(iso: string | null): string` in `src/app/field/format.ts` — the receive and distribute screens use it too
  - `transportRequest(draft: TransportDraft): CreateTransportReq | null` where `TransportDraft = { type: TransportType | null; typeDetails: string; licensePlate: string; groupId: number | null }`
  - the `/field/load` route, which accepts an optional `?groupId=` so "load another" comes back with the group already chosen

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/load-open
```

- [ ] **Step 2: Write the failing tests** — `tests/field/scan/format.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { formatHeDateTime } from '@/app/field/format';

describe('formatHeDateTime', () => {
  it('shows a day, a month and a time', () => {
    // Built from local parts so the assertion holds in any timezone.
    const iso = new Date(2026, 8, 22, 14, 5).toISOString();
    expect(formatHeDateTime(iso)).toBe('22/09 14:05');
  });

  it('pads single digits', () => {
    const iso = new Date(2026, 0, 3, 9, 7).toISOString();
    expect(formatHeDateTime(iso)).toBe('03/01 09:07');
  });

  it('shows a dash for a timestamp that is not set yet', () => {
    expect(formatHeDateTime(null)).toBe('—');
  });
});
```

and `tests/field/scan/load-logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { transportRequest } from '@/app/field/load/logic';

const draft = (over: Partial<Parameters<typeof transportRequest>[0]> = {}) => ({
  type: 'truck' as const,
  typeDetails: '',
  licensePlate: '12-345-67',
  groupId: 1,
  ...over,
});

describe('transportRequest', () => {
  it('builds a truck request', () => {
    expect(transportRequest(draft())).toEqual({ type: 'truck', licensePlate: '12-345-67', groupId: 1 });
  });

  it('trims the licence plate', () => {
    expect(transportRequest(draft({ licensePlate: '  12-345-67 ' }))?.licensePlate).toBe('12-345-67');
  });

  it('refuses a blank or whitespace-only licence plate', () => {
    expect(transportRequest(draft({ licensePlate: '' }))).toBeNull();
    expect(transportRequest(draft({ licensePlate: '   ' }))).toBeNull();
  });

  it('refuses until a type and a group are chosen', () => {
    expect(transportRequest(draft({ type: null }))).toBeNull();
    expect(transportRequest(draft({ groupId: null }))).toBeNull();
  });

  // flows/transporting_flow.md note Zn: choosing "אחר" means saying what it is.
  it('requires details for a transport that is not a truck', () => {
    expect(transportRequest(draft({ type: 'other', typeDetails: '' }))).toBeNull();
    expect(transportRequest(draft({ type: 'other', typeDetails: '  ' }))).toBeNull();
    expect(transportRequest(draft({ type: 'other', typeDetails: ' רכב פרטי ' }))).toEqual({
      type: 'other',
      typeDetails: 'רכב פרטי',
      licensePlate: '12-345-67',
      groupId: 1,
    });
  });

  it('drops details left behind after switching back to a truck', () => {
    expect(transportRequest(draft({ type: 'truck', typeDetails: 'רכב פרטי' }))).toEqual({
      type: 'truck',
      licensePlate: '12-345-67',
      groupId: 1,
    });
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

```bash
npm test -- tests/field/scan/format.test.ts tests/field/scan/load-logic.test.ts
```

Expected: FAIL — neither module exists.

- [ ] **Step 4: Write `src/app/field/format.ts`**

```ts
/**
 * Shared display formatting for the field flows.
 * Owner: P4 (additive file in a folder whose pages belong to P3 — announce it in chat).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "22/09 14:05" in the phone's own timezone, or "—" when there is no timestamp yet. */
export function formatHeDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 5: Write `src/app/field/load/logic.ts`**

```ts
import type { CreateTransportReq, TransportType } from '@/lib/contracts';

export interface TransportDraft {
  type: TransportType | null;
  typeDetails: string;
  licensePlate: string;
  groupId: number | null;
}

/** The form's request, or null while it is not complete enough to send. */
export function transportRequest(draft: TransportDraft): CreateTransportReq | null {
  if (draft.type === null || draft.groupId === null) return null;

  const licensePlate = draft.licensePlate.trim();
  if (!licensePlate) return null;

  const typeDetails = draft.typeDetails.trim();
  // flows/transporting_flow.md note Zn: "אחר" is only meaningful with a description.
  if (draft.type === 'other' && !typeDetails) return null;

  return {
    type: draft.type,
    licensePlate,
    groupId: draft.groupId,
    ...(draft.type === 'other' ? { typeDetails } : {}),
  };
}
```

- [ ] **Step 6: Run the tests**

```bash
npm test -- tests/field/scan/format.test.ts tests/field/scan/load-logic.test.ts
```

Expected: PASS.

- [ ] **Step 7: Replace `src/app/field/load/page.tsx`** (Task 2's probe goes away here)

```tsx
import { LoadStart } from './LoadStart';

export const dynamic = 'force-dynamic';

// Next.js 15: searchParams is async.
export default async function LoadPage({ searchParams }: { searchParams: Promise<{ groupId?: string }> }) {
  const { groupId } = await searchParams;
  const parsed = Number(groupId);
  return <LoadStart initialGroupId={Number.isInteger(parsed) && parsed > 0 ? parsed : null} />;
}
```

- [ ] **Step 8: Write `src/app/field/load/LoadStart.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, OptionList, Spinner, TextField, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { TRANSPORT_TYPES, type TransportType } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from '../format';
import { transportRequest } from './logic';

export function LoadStart({ initialGroupId }: { initialGroupId: number | null }) {
  const router = useRouter();
  const { busy, error, run } = useAction();

  const [type, setType] = useState<TransportType | null>(null);
  const [typeDetails, setTypeDetails] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [groupId, setGroupId] = useState<number | null>(initialGroupId);

  const groups = useSWR('groups', api.groups);
  // A truck left half-loaded on another phone, or before a refresh.
  const loading = useSWR('trucks-loading', () => api.transportUnits('loading'));

  const req = transportRequest({ type, typeDetails, licensePlate, groupId });

  function create() {
    if (!req) return;
    void run(
      () => api.createTransportUnit(req),
      (truck) => router.push(`/field/load/${truck.id}`),
    );
  }

  if (groups.error) return <Banner tone="danger">{describeError(groups.error).messageHe}</Banner>;
  if (!groups.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      {loading.data && loading.data.length > 0 && (
        <Card>
          <p className="mb-2 font-bold">יחידות הובלה בהעמסה</p>
          <OptionList
            options={loading.data.map((t) => ({
              value: t.id,
              label: `${TRANSPORT_TYPE_LABELS[t.type]} ${t.licensePlate}`,
              hint: `${t.boxes.length} אריזות · נפתחה ${formatHeDateTime(t.createdAt)}`,
            }))}
            value={null}
            onChange={(id) => router.push(`/field/load/${id}`)}
          />
        </Card>
      )}

      <Card>
        <p className="mb-2 font-bold">סוג יחידת הובלה</p>
        <OptionList
          options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_TYPE_LABELS[t] }))}
          value={type}
          onChange={setType}
        />
        {type === 'other' && (
          <div className="mt-3">
            <TextField label="פירוט" value={typeDetails} onChange={setTypeDetails} />
          </div>
        )}
      </Card>

      <Card>
        <TextField label="מספר רישוי" value={licensePlate} onChange={setLicensePlate} inputMode="numeric" />
      </Card>

      <Card>
        <p className="mb-2 font-bold">מדור</p>
        <OptionList
          options={groups.data.map((g) => ({ value: g.id, label: g.name }))}
          value={groupId}
          onChange={setGroupId}
        />
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={create} busy={busy} disabled={req === null}>
        פתיחת יחידת הובלה
      </Button>
    </div>
  );
}
```

`תאריך ההובלה ייגזר אוטומטית מהמערכת` (flow note AAn1) — the server sets `createdAt`; there is deliberately no date field on this form.

- [ ] **Step 9: Walk the screen**

```bash
npm run dev
```

At `/field/load`: pick `משאית`, type `12-345-67`, pick `ענף תקשוב — מדור מערכות` → `פתיחת יחידת הובלה` → you land on `/field/load/1`, which 404s until Task 4. Pick `אחר` and leave the details blank → the button stays disabled. Go back to `/field/load` → the new truck appears under `יחידות הובלה בהעמסה`.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/load src/app/field/format.ts tests/field/scan
git commit -m "feat(load): open a transport unit"
```

Post in chat: *"`src/app/field/format.ts` is new and mine — `formatHeDateTime(iso)`. It is additive; I touched none of P3's files in that folder."*

---

### Task 4: Load step 2 — scan boxes onto the truck and send it

`flows/transporting_flow.md` nodes AC through AH, spec §5.2. Review Focus 4 lives here.

**Files:**
- Create: `src/app/field/load/[truckId]/page.tsx`, `src/app/field/load/[truckId]/LoadTruck.tsx`, `src/app/field/load/[truckId]/LoadDone.tsx`
- Modify: `src/app/field/load/logic.ts` (append), `tests/field/scan/load-logic.test.ts` (append)

**Interfaces:**
- Consumes: `api.transportUnits('loading')`, `api.packingUnits({ status: 'closed' })`, `api.loadTransportUnit(id, req)`; `ScanOrType`; `addCode`, `normalizeCode`, `removeCode` from `@/lib/scan-session`; `feedback`; P3's kit.
- Produces:
  - `classifyLoadScan(raw: string, available: PackingUnitSummaryDTO[], picked: string[]): LoadScan` where `LoadScan = { kind: 'invalid' | 'unknown'; messageHe: string } | { kind: 'duplicate' | 'accepted'; code: string; messageHe: string }`
  - `loadSummary(truck: TransportUnitDTO): { title: string; lines: string[] }`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/load-scan
```

- [ ] **Step 2: Append the failing tests to `tests/field/scan/load-logic.test.ts`**

```ts
import type { PackingUnitSummaryDTO, TransportUnitDTO } from '@/lib/contracts';
import { classifyLoadScan, loadSummary } from '@/app/field/load/logic';

const box = (code: string): PackingUnitSummaryDTO => ({
  id: Number(code),
  code,
  type: 'professional_carton',
  status: 'closed',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
});

describe('classifyLoadScan', () => {
  const available = [box('10001'), box('10002')];

  it('accepts a closed box that is not picked yet', () => {
    expect(classifyLoadScan('10001', available, [])).toMatchObject({ kind: 'accepted', code: '10001' });
  });

  it('tolerates whitespace around a scanned code', () => {
    expect(classifyLoadScan(' 10001 ', available, [])).toMatchObject({ kind: 'accepted', code: '10001' });
  });

  it('refuses something that is not a five-digit code', () => {
    const scan = classifyLoadScan('123', available, []);
    expect(scan.kind).toBe('invalid');
    expect(scan.messageHe).toBe('יש להזין מספר אריזה בן 5 ספרות');
  });

  // spec §5.5: a re-scan is friendly, not an error.
  it('reports a box already on the list as a duplicate', () => {
    const scan = classifyLoadScan('10001', available, ['10001']);
    expect(scan).toMatchObject({ kind: 'duplicate', code: '10001' });
    expect(scan.messageHe).toBe('אריזה 10001 כבר בהעמסה');
  });

  /**
   * Review Focus 4: a box on another truck, or one never closed, is simply absent
   * from the closed list. P2 would reject the entire load for it, so it never
   * reaches the accumulated codes.
   */
  it('refuses a code that is not available for loading', () => {
    const scan = classifyLoadScan('99999', available, []);
    expect(scan.kind).toBe('unknown');
    expect(scan.messageHe).toBe('אריזה 99999 אינה זמינה להעמסה');
  });

  it('refuses everything while the available list is still empty', () => {
    expect(classifyLoadScan('10001', [], []).kind).toBe('unknown');
  });
});

describe('loadSummary', () => {
  const truck = (over: Partial<TransportUnitDTO> = {}): TransportUnitDTO => ({
    id: 1,
    type: 'truck',
    typeDetails: null,
    licensePlate: '12-345-67',
    groupId: 1,
    status: 'in_transit',
    createdAt: new Date(2026, 8, 22, 13, 0).toISOString(),
    departedAt: new Date(2026, 8, 22, 14, 5).toISOString(),
    releasedAt: null,
    boxes: [box('10001'), box('10002')],
    ...over,
  });

  // flows/transporting_flow.md note AEn1: plate, box count, date and time.
  it('reports the plate, the box count and the departure time', () => {
    expect(loadSummary(truck())).toEqual({
      title: 'יחידת הובלה הועמסה',
      lines: ['מספר רישוי: 12-345-67', '2 אריזות', 'יציאה: 22/09 14:05'],
    });
  });

  it('names the transport when it is not a truck', () => {
    const s = loadSummary(truck({ type: 'other', typeDetails: 'רכב פרטי' }));
    expect(s.lines).toContain('סוג: רכב פרטי');
  });

  it('does not invent a departure time it was not given', () => {
    expect(loadSummary(truck({ departedAt: null })).lines).toContain('יציאה: —');
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

```bash
npm test -- tests/field/scan/load-logic.test.ts
```

Expected: FAIL — `classifyLoadScan` and `loadSummary` are not exported yet.

- [ ] **Step 4: Append to `src/app/field/load/logic.ts`**

Merge the new type imports into the file's existing `import type { ... } from '@/lib/contracts'` line rather than adding a second import from the same module.

```ts
import type { PackingUnitSummaryDTO, TransportUnitDTO } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';
import { formatHeDateTime } from '../format';

export type LoadScan =
  | { kind: 'invalid'; messageHe: string }
  | { kind: 'unknown'; messageHe: string }
  | { kind: 'duplicate'; code: string; messageHe: string }
  | { kind: 'accepted'; code: string; messageHe: string };

/**
 * What a scan means on the loading screen, decided entirely from data the client
 * already has. P2 validates the whole `codes` list before writing anything, so a
 * code it would refuse must never get onto the list in the first place.
 */
export function classifyLoadScan(
  raw: string,
  available: PackingUnitSummaryDTO[],
  picked: string[],
): LoadScan {
  const code = normalizeCode(raw);
  if (!code) return { kind: 'invalid', messageHe: `יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות` };
  if (picked.includes(code)) return { kind: 'duplicate', code, messageHe: `אריזה ${code} כבר בהעמסה` };
  // Absent from the closed list = never closed, already on a truck, or already received.
  if (!available.some((b) => b.code === code)) {
    return { kind: 'unknown', messageHe: `אריזה ${code} אינה זמינה להעמסה` };
  }
  return { kind: 'accepted', code, messageHe: `אריזה ${code} נוספה` };
}

/** The "יחידת הובלה הועמסה" popup (flows/transporting_flow.md note AEn1). */
export function loadSummary(truck: TransportUnitDTO): { title: string; lines: string[] } {
  const lines = [`מספר רישוי: ${truck.licensePlate}`];
  if (truck.type !== 'truck') {
    lines.push(`סוג: ${truck.typeDetails ?? TRANSPORT_TYPE_LABELS[truck.type]}`);
  }
  lines.push(`${truck.boxes.length} אריזות`);
  lines.push(`יציאה: ${formatHeDateTime(truck.departedAt)}`);
  return { title: 'יחידת הובלה הועמסה', lines };
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- tests/field/scan/load-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/load/[truckId]/page.tsx`**

```tsx
import { LoadTruck } from './LoadTruck';

export const dynamic = 'force-dynamic';

export default async function LoadTruckPage({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  return <LoadTruck truckId={Number(truckId)} />;
}
```

- [ ] **Step 7: Write `src/app/field/load/[truckId]/LoadDone.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { TransportUnitDTO } from '@/lib/contracts';
import { loadSummary } from '../logic';

export function LoadDone({ truck }: { truck: TransportUnitDTO }) {
  const router = useRouter();
  const summary = loadSummary(truck);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone="ok" title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>

      {/* flows/transporting_flow.md node AH: another load is a new transport unit under the same group. */}
      <Button onClick={() => router.push(`/field/load?groupId=${truck.groupId}`)}>העמסה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Write `src/app/field/load/[truckId]/LoadTruck.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import type { TransportUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS, TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { addCode, removeCode } from '@/lib/scan-session';
import { classifyLoadScan } from '../logic';
import { LoadDone } from './LoadDone';

export function LoadTruck({ truckId }: { truckId: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [done, setDone] = useState<TransportUnitDTO | null>(null);
  const { busy, error, run } = useAction();

  const trucks = useSWR('trucks-loading', () => api.transportUnits('loading'));
  const available = useSWR('boxes-closed', () => api.packingUnits({ status: 'closed' }));

  const truck = trucks.data?.find((t) => t.id === truckId) ?? null;

  function scan(raw: string) {
    const scanned = classifyLoadScan(raw, available.data ?? [], picked);
    if (scanned.kind === 'accepted') {
      setPicked((prev) => addCode(prev, scanned.code).codes);
      setNote({ tone: 'ok', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'duplicate') {
      // A re-scan is a friendly no-op, not a failure (spec §5.5).
      setNote({ tone: 'warn', text: scanned.messageHe });
      feedback('success');
      return;
    }
    setNote({ tone: 'danger', text: scanned.messageHe });
    feedback('error');
  }

  function finish() {
    void run(
      () => api.loadTransportUnit(truckId, { codes: picked }),
      (loaded) => setDone(loaded),
    );
  }

  if (done) return <LoadDone truck={done} />;
  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (!truck) {
    return (
      <Card className="text-center">
        <p className="font-bold">יחידת ההובלה אינה בהעמסה</p>
        <p className="mt-1 text-sm text-ink-muted">ייתכן שכבר יצאה לדרך.</p>
        <Link href="/field/load" className="mt-4 inline-block text-link">
          חזרה ליחידות ההובלה
        </Link>
      </Card>
    );
  }

  const availableBoxes = available.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">
          {TRANSPORT_TYPE_LABELS[truck.type]} {truck.licensePlate}
        </p>
        <p className="text-sm text-ink-muted">{truck.typeDetails ?? 'סריקת האריזות להעמסה'}</p>
      </Card>

      <ScanOrType onCode={scan} hint="סרקו את מדבקת האריזה או הקלידו את מספרה" />
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <Card>
        <p className="mb-2 font-bold">אריזות סגורות</p>
        {available.error ? (
          <Banner tone="danger">{describeError(available.error).messageHe}</Banner>
        ) : !available.data ? (
          <Spinner />
        ) : availableBoxes.length === 0 ? (
          <p className="text-sm text-ink-muted">אין כרגע אריזות סגורות הממתינות להעמסה.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {availableBoxes.map((b) => {
              const code = b.code;
              if (code === null) return null;
              const on = picked.includes(code);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => (on ? setPicked((p) => removeCode(p, code)) : scan(code))}
                    aria-pressed={on}
                    className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-card border-2 px-4 text-right ${
                      on ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
                    }`}
                  >
                    <span>
                      <span className="block font-bold tabular-nums">{code}</span>
                      <span className="block text-sm text-ink-muted">
                        {PACKING_UNIT_TYPE_LABELS[b.type]} · {b.sourceRoomName}
                      </span>
                    </span>
                    <span aria-hidden className="text-2xl text-primary">
                      {on ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <p className="mb-2 text-center text-sm text-ink-muted">בהעמסה: {picked.length} אריזות</p>
        <Button onClick={finish} busy={busy} disabled={picked.length === 0}>
          סיום העמסה
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Walk the flow**

```bash
npm run demo:reset
npm run dev
```

Pack two boxes first (P3's flow, or `npm run demo:reset` plus whatever is on `main`), then at `/field/load`: open a truck, scan or tap both boxes, watch the counter reach 2, and scan one of them again — expect the calm `כבר בהעמסה` line and the success tone, not an error. Type `99999` — expect `אינה זמינה להעמסה` and the error tone, and the counter unchanged. Then `סיום העמסה`: the completion banner shows the plate, `2 אריזות` and the departure time.

Check the write landed:

```bash
npx prisma studio
```

Expected: both `packing_units` rows `in_transit` with `transport_unit_id` set, the truck `in_transit` with `departed_at`, and one `notifications` row containing `יחידת הובלה הועמסה`.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/load tests/field/scan
git commit -m "feat(load): scan boxes onto a transport unit and send it"
```

---

### Task 5: Receive step 1 — pick a truck and scan what comes off it

`flows/unloading_flow.md` nodes C through F, spec §5.3.1–2. Review Focus 3 lives here.

**Files:**
- Create: `src/app/field/receive/page.tsx`, `src/app/field/receive/ReceiveStart.tsx`, `src/app/field/receive/logic.ts`, `src/app/field/receive/[truckId]/page.tsx`, `src/app/field/receive/[truckId]/ReceiveTruck.tsx`
- Test: `tests/field/scan/receive-logic.test.ts`

**Interfaces:**
- Consumes: `api.transportUnits('in_transit')`, `api.packingUnitByCode(code)`; `ScanOrType`; `normalizeCode`, `addCode` from `@/lib/scan-session`; `PACKING_UNIT_STATUS_LABELS` from `@/lib/labels`; P3's kit.
- Produces:
  - `expectedCodes(truck: TransportUnitDTO): string[]`
  - `classifyReceiveScan(raw: string, expected: string[], confirmed: string[], surplus: string[]): ReceiveScan` where `ReceiveScan = { kind: 'invalid'; messageHe: string } | { kind: 'duplicate'; code: string; messageHe: string } | { kind: 'confirmed'; code: string; messageHe: string } | { kind: 'offsite'; code: string }`
  - `surplusVerdict(code: string, unit: PackingUnitDTO | null): { kind: 'offer' | 'reject'; messageHe: string }`
  - `unconfirmedCodes(expected: string[], confirmed: string[]): string[]`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/receive-scan
```

- [ ] **Step 2: Write the failing test** — `tests/field/scan/receive-logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { PackingUnitDTO, PackingUnitStatus, TransportUnitDTO } from '@/lib/contracts';
import {
  classifyReceiveScan,
  expectedCodes,
  surplusVerdict,
  unconfirmedCodes,
} from '@/app/field/receive/logic';

const summary = (code: string | null) => ({
  id: 1,
  code,
  type: 'professional_carton' as const,
  status: 'in_transit' as const,
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
});

const truck = (codes: (string | null)[]): TransportUnitDTO => ({
  id: 1,
  type: 'truck',
  typeDetails: null,
  licensePlate: '12-345-67',
  groupId: 1,
  status: 'in_transit',
  createdAt: new Date(2026, 8, 22, 13, 0).toISOString(),
  departedAt: new Date(2026, 8, 22, 14, 5).toISOString(),
  releasedAt: null,
  boxes: codes.map(summary),
});

const box = (status: PackingUnitStatus): PackingUnitDTO => ({
  ...summary('10009'),
  status,
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: null,
  transportUnitId: 2,
  packedByName: 'רב"ט ארז כהן',
  closedAt: new Date(2026, 8, 22, 12, 0).toISOString(),
  items: [],
});

describe('expectedCodes', () => {
  it('lists the codes of the boxes on the truck', () => {
    expect(expectedCodes(truck(['10001', '10002']))).toEqual(['10001', '10002']);
  });

  it('ignores a box that somehow has no code', () => {
    expect(expectedCodes(truck(['10001', null]))).toEqual(['10001']);
  });
});

describe('classifyReceiveScan', () => {
  const expected = ['10001', '10002'];

  it('confirms a box that is on this truck', () => {
    expect(classifyReceiveScan('10001', expected, [], [])).toMatchObject({ kind: 'confirmed', code: '10001' });
  });

  it('refuses something that is not a five-digit code', () => {
    expect(classifyReceiveScan('12', expected, [], []).kind).toBe('invalid');
  });

  it('treats a re-scan of a confirmed box as a friendly duplicate', () => {
    expect(classifyReceiveScan('10001', expected, ['10001'], [])).toEqual({
      kind: 'duplicate',
      code: '10001',
      messageHe: 'אריזה 10001 כבר סומנה',
    });
  });

  it('treats a re-scan of an accepted surplus box as a duplicate too', () => {
    expect(classifyReceiveScan('10009', expected, [], ['10009']).kind).toBe('duplicate');
  });

  it('sends a code that is not on this truck off for a lookup', () => {
    expect(classifyReceiveScan('10009', expected, [], [])).toEqual({ kind: 'offsite', code: '10009' });
  });
});

describe('surplusVerdict', () => {
  /**
   * Review Focus 3: only a box the server will actually accept may be offered as surplus.
   * Anything else turns one stray scan into a failed unload for the whole truck.
   */
  it('offers a box that is in transit on another truck', () => {
    const v = surplusVerdict('10009', box('in_transit'));
    expect(v.kind).toBe('offer');
    expect(v.messageHe).toBe('אריזה 10009 לא הועמסה על יחידת הובלה זו. לקבל בכל זאת?');
  });

  it('rejects a code that does not exist', () => {
    expect(surplusVerdict('99999', null)).toEqual({ kind: 'reject', messageHe: 'אריזה 99999 לא נמצאה' });
  });

  it('rejects a box that is still closed at the source', () => {
    const v = surplusVerdict('10009', box('closed'));
    expect(v.kind).toBe('reject');
    expect(v.messageHe).toContain('אריזה נסגרה');
  });

  it('rejects a box that was already received', () => {
    const v = surplusVerdict('10009', box('received'));
    expect(v.kind).toBe('reject');
    expect(v.messageHe).toContain('אריזה התקבלה');
  });

  it('rejects a box already marked missing', () => {
    expect(surplusVerdict('10009', box('missing')).kind).toBe('reject');
  });
});

describe('unconfirmedCodes', () => {
  it('names what has not come off the truck yet, in loading order', () => {
    expect(unconfirmedCodes(['10001', '10002', '10003'], ['10002'])).toEqual(['10001', '10003']);
  });

  it('is empty once everything is confirmed', () => {
    expect(unconfirmedCodes(['10001'], ['10001'])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/scan/receive-logic.test.ts
```

Expected: FAIL with `Cannot find module '@/app/field/receive/logic'`.

- [ ] **Step 4: Write `src/app/field/receive/logic.ts`**

```ts
import type { PackingUnitDTO, TransportUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_STATUS_LABELS } from '@/lib/labels';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';

/** The boxes this truck was loaded with — the checklist the unloader works against. */
export function expectedCodes(truck: TransportUnitDTO): string[] {
  return truck.boxes.map((b) => b.code).filter((c): c is string => c !== null);
}

export type ReceiveScan =
  | { kind: 'invalid'; messageHe: string }
  | { kind: 'duplicate'; code: string; messageHe: string }
  | { kind: 'confirmed'; code: string; messageHe: string }
  /** Not on this truck: the screen must look the box up before offering anything. */
  | { kind: 'offsite'; code: string };

export function classifyReceiveScan(
  raw: string,
  expected: string[],
  confirmed: string[],
  surplus: string[],
): ReceiveScan {
  const code = normalizeCode(raw);
  if (!code) return { kind: 'invalid', messageHe: `יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות` };
  if (confirmed.includes(code) || surplus.includes(code)) {
    return { kind: 'duplicate', code, messageHe: `אריזה ${code} כבר סומנה` };
  }
  if (expected.includes(code)) return { kind: 'confirmed', code, messageHe: `אריזה ${code} התקבלה` };
  return { kind: 'offsite', code };
}

/**
 * Whether a box that is not on this truck may be offered as surplus (spec §5.3.2).
 *
 * P2 accepts a surplus code only as `in_transit → received`; anything else throws
 * and the *entire* receive is rolled back, taking every other box's confirmation
 * with it. So the prompt is only ever shown for a box the server will accept.
 */
export function surplusVerdict(
  code: string,
  unit: PackingUnitDTO | null,
): { kind: 'offer' | 'reject'; messageHe: string } {
  if (!unit) return { kind: 'reject', messageHe: `אריזה ${code} לא נמצאה` };
  if (unit.status !== 'in_transit') {
    return {
      kind: 'reject',
      messageHe: `אריזה ${code} בסטטוס "${PACKING_UNIT_STATUS_LABELS[unit.status]}" ולא ניתן לקבל אותה כאן`,
    };
  }
  return { kind: 'offer', messageHe: `אריזה ${code} לא הועמסה על יחידת הובלה זו. לקבל בכל זאת?` };
}

export function unconfirmedCodes(expected: string[], confirmed: string[]): string[] {
  return expected.filter((c) => !confirmed.includes(c));
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/scan/receive-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/receive/page.tsx` and `ReceiveStart.tsx`**

```tsx
// src/app/field/receive/page.tsx
import { ReceiveStart } from './ReceiveStart';

export const dynamic = 'force-dynamic';

export default function ReceivePage() {
  return <ReceiveStart />;
}
```

```tsx
// src/app/field/receive/ReceiveStart.tsx
'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Banner, Card, describeError, EmptyState, OptionList, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from '../format';

export function ReceiveStart() {
  const router = useRouter();
  const trucks = useSWR('trucks-in-transit', () => api.transportUnits('in_transit'));

  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (trucks.data.length === 0) {
    return <EmptyState title="אין כרגע יחידות הובלה בדרך" body="ברגע שיחידת הובלה תצא לדרך היא תופיע כאן." />;
  }

  return (
    <Card>
      <p className="mb-2 font-bold">יחידות הובלה בדרך</p>
      <OptionList
        options={trucks.data.map((t) => ({
          value: t.id,
          label: `${TRANSPORT_TYPE_LABELS[t.type]} ${t.licensePlate}`,
          hint: `${t.boxes.length} אריזות · יציאה ${formatHeDateTime(t.departedAt)}`,
        }))}
        value={null}
        onChange={(id) => router.push(`/field/receive/${id}`)}
      />
    </Card>
  );
}
```

- [ ] **Step 7: Write `src/app/field/receive/[truckId]/page.tsx`**

```tsx
import { ReceiveTruck } from './ReceiveTruck';

export const dynamic = 'force-dynamic';

export default async function ReceiveTruckPage({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  return <ReceiveTruck truckId={Number(truckId)} />;
}
```

- [ ] **Step 8: Write the scanning step of `src/app/field/receive/[truckId]/ReceiveTruck.tsx`**

Task 6 replaces this file with the full three-step machine; this version gets the scanning and the surplus prompt right first.

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Dialog, Spinner } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS, TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { addCode } from '@/lib/scan-session';
import { classifyReceiveScan, expectedCodes, surplusVerdict, unconfirmedCodes } from '../logic';

export function ReceiveTruck({ truckId }: { truckId: number }) {
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [surplus, setSurplus] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [ask, setAsk] = useState<{ code: string; messageHe: string } | null>(null);

  const trucks = useSWR('trucks-in-transit', () => api.transportUnits('in_transit'));
  const truck = trucks.data?.find((t) => t.id === truckId) ?? null;
  const expected = truck ? expectedCodes(truck) : [];

  async function scan(raw: string) {
    const scanned = classifyReceiveScan(raw, expected, confirmed, surplus);

    if (scanned.kind === 'confirmed') {
      setConfirmed((prev) => addCode(prev, scanned.code).codes);
      setNote({ tone: 'ok', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'duplicate') {
      setNote({ tone: 'warn', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'invalid') {
      setNote({ tone: 'danger', text: scanned.messageHe });
      feedback('error');
      return;
    }

    // Not on this truck: ask the server what it is before offering anything.
    const unit = await api.packingUnitByCode(scanned.code).catch(() => null);
    const verdict = surplusVerdict(scanned.code, unit);
    if (verdict.kind === 'reject') {
      setNote({ tone: 'danger', text: verdict.messageHe });
      feedback('error');
      return;
    }
    feedback('error');
    setAsk({ code: scanned.code, messageHe: verdict.messageHe });
  }

  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (!truck) {
    return (
      <Card className="text-center">
        <p className="font-bold">יחידת ההובלה אינה בדרך</p>
        <p className="mt-1 text-sm text-ink-muted">ייתכן שכבר נפרקה ושוחררה.</p>
        <Link href="/field/receive" className="mt-4 inline-block text-link">
          חזרה ליחידות ההובלה
        </Link>
      </Card>
    );
  }

  const missing = unconfirmedCodes(expected, confirmed);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">
          {TRANSPORT_TYPE_LABELS[truck.type]} {truck.licensePlate}
        </p>
        <p className="text-sm text-ink-muted">סרקו כל אריזה שיורדת מיחידת ההובלה</p>
      </Card>

      <ScanOrType onCode={(code) => void scan(code)} />
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <Card>
        <p className="mb-2 font-bold">אריזות על יחידת ההובלה</p>
        <ul className="flex flex-col gap-2">
          {truck.boxes.map((b) => {
            const on = b.code !== null && confirmed.includes(b.code);
            return (
              <li
                key={b.id}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-card border-2 px-4 ${
                  on ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
                }`}
              >
                <span>
                  <span className="block font-bold tabular-nums">{b.code}</span>
                  <span className="block text-sm text-ink-muted">
                    {PACKING_UNIT_TYPE_LABELS[b.type]} · {b.sourceRoomName}
                  </span>
                </span>
                <span aria-hidden className="text-2xl text-primary">
                  {on ? '✓' : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {surplus.length > 0 && (
          <p className="mt-3 text-sm text-warn">התקבלו בעודף: {surplus.join(', ')}</p>
        )}
      </Card>

      <Dialog open={ask !== null} title="אריזה בעודף" onClose={() => setAsk(null)}>
        <p className="mb-4">{ask?.messageHe}</p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              if (!ask) return;
              setSurplus((prev) => addCode(prev, ask.code).codes);
              setNote({ tone: 'warn', text: `אריזה ${ask.code} התקבלה כעודף` });
              feedback('success');
              setAsk(null);
            }}
          >
            כן, לקבל כעודף
          </Button>
          <Button variant="secondary" onClick={() => setAsk(null)}>
            לא
          </Button>
        </div>
      </Dialog>

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        {/* spec §5.3.2: the live counter is what the unloader actually watches. */}
        <p className="mb-2 text-center text-lg font-bold tabular-nums">
          {confirmed.length}/{expected.length}
        </p>
        <Button disabled>{missing.length > 0 ? `סיום פריקה (${missing.length} חסרות)` : 'סיום פריקה'}</Button>
      </div>
    </div>
  );
}
```

`סיום פריקה` is deliberately inert until Task 6 wires the recheck and the submit — nothing may be written from a half-built flow.

- [ ] **Step 9: Walk the screen**

```bash
npm run dev
```

Load a truck with two boxes first (Task 4). At `/field/receive`, pick it. Scan one box → the counter reads `1/2` and its row ticks. Scan it again → `כבר סומנה` in amber with the success tone. Type `99999` → `לא נמצאה` in red. Load a *second* truck with a third box, come back, and scan that third box here → the surplus dialog appears; accept it and it shows under `התקבלו בעודף`. Then pack a fresh box and, without loading it, scan it here → expect the red `בסטטוס "אריזה נסגרה"` line and **no** dialog. That is Review Focus 3.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/receive tests/field/scan
git commit -m "feat(receive): pick a truck, scan boxes, guard the surplus prompt"
```

---

### Task 6: Receive step 2 — recheck the missing boxes, then release the truck

`flows/unloading_flow.md` nodes G through L, spec §5.3.3–5. The step that turns an unscanned box into an explicit `missing` rather than a silent loss.

**Files:**
- Create: `src/app/field/receive/[truckId]/ReceiveRecheck.tsx`, `src/app/field/receive/[truckId]/ReceiveDone.tsx`
- Modify: `src/app/field/receive/[truckId]/ReceiveTruck.tsx` (step machine), `src/app/field/receive/logic.ts` (append), `tests/field/scan/receive-logic.test.ts` (append)

**Interfaces:**
- Consumes: Task 5's helpers; `api.receiveTransportUnit(id, req)`; `ReceiveResult` from `@/lib/contracts`.
- Produces: `receiveSummary(result: ReceiveResult): { title: string; tone: 'ok' | 'warn'; lines: string[] }`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/receive-finish
```

- [ ] **Step 2: Append the failing test to `tests/field/scan/receive-logic.test.ts`**

```ts
import type { ReceiveResult } from '@/lib/contracts';
import { receiveSummary } from '@/app/field/receive/logic';

const result = (over: Partial<ReceiveResult> = {}): ReceiveResult => ({
  transportUnit: { ...truck(['10001', '10002']), status: 'released', releasedAt: new Date(2026, 8, 22, 16, 30).toISOString() },
  receivedCodes: ['10001', '10002'],
  missingCodes: [],
  surplusCodes: [],
  ...over,
});

describe('receiveSummary', () => {
  it('reports a clean unload', () => {
    const s = receiveSummary(result());
    expect(s).toMatchObject({ title: 'יחידת הובלה שוחררה', tone: 'ok' });
    expect(s.lines).toContain('התקבלו 2 אריזות');
    expect(s.lines).toContain('מספר רישוי: 12-345-67');
  });

  it('names every missing box and turns the summary amber', () => {
    const s = receiveSummary(result({ receivedCodes: ['10001'], missingCodes: ['10002'] }));
    expect(s).toMatchObject({ title: 'יחידת הובלה שוחררה עם חוסר', tone: 'warn' });
    expect(s.lines).toContain('חסרות 1 אריזות: 10002');
  });

  it('reports accepted surplus boxes separately', () => {
    const s = receiveSummary(result({ surplusCodes: ['10009'] }));
    expect(s.lines).toContain('התקבלו בעודף: 10009');
  });

  /**
   * A code the unloader marked surplus that turns out to be on the truck comes back
   * in receivedCodes, not surplusCodes. The screen reports the server's answer.
   */
  it('reads the server lists, not the ones the phone sent', () => {
    const s = receiveSummary(result({ receivedCodes: ['10001', '10002'], surplusCodes: [] }));
    expect(s.lines.join(' ')).not.toContain('עודף');
  });

  it('says nothing about missing boxes when there are none', () => {
    expect(receiveSummary(result()).lines.join(' ')).not.toContain('חסרות');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/scan/receive-logic.test.ts
```

Expected: FAIL — `receiveSummary` is not exported yet.

- [ ] **Step 4: Append to `src/app/field/receive/logic.ts`**

Merge the new type import into the file's existing `import type { ... } from '@/lib/contracts'` line.

```ts
import type { ReceiveResult } from '@/lib/contracts';

/**
 * The closing summary of an unload (flows/unloading_flow.md note Ln1).
 * Everything here comes from the server's result — a code the phone put in
 * `surplusCodes` that was in fact on the truck comes back as a normal receive.
 */
export function receiveSummary(result: ReceiveResult): {
  title: string;
  tone: 'ok' | 'warn';
  lines: string[];
} {
  const lines = [
    `מספר רישוי: ${result.transportUnit.licensePlate}`,
    `התקבלו ${result.receivedCodes.length} אריזות`,
  ];
  if (result.surplusCodes.length > 0) {
    lines.push(`התקבלו בעודף: ${result.surplusCodes.join(', ')}`);
  }
  if (result.missingCodes.length === 0) {
    return { title: 'יחידת הובלה שוחררה', tone: 'ok', lines };
  }
  lines.push(`חסרות ${result.missingCodes.length} אריזות: ${result.missingCodes.join(', ')}`);
  return { title: 'יחידת הובלה שוחררה עם חוסר', tone: 'warn', lines };
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/scan/receive-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/receive/[truckId]/ReceiveRecheck.tsx`**

```tsx
'use client';

import { Banner, Button, Card } from '@/components/ui';

/**
 * flows/unloading_flow.md nodes I–K: before anything is written, the unloader is
 * shown exactly which boxes are about to be recorded as missing, and gets one more
 * chance to find them. Nothing has been sent yet at this point.
 */
export function ReceiveRecheck({
  missing,
  onFound,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  missing: string[];
  onFound: (code: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warn" title="שים לב, לא כל האריזות נפרקו">
        האריזות הבאות יירשמו כחסרות. כדאי לבדוק שוב לפני סיום.
      </Banner>

      <Card>
        <ul className="flex flex-col gap-2">
          {missing.map((code) => (
            <li key={code} className="flex flex-col gap-2 rounded-card border-2 border-subtle p-3">
              <span className="text-lg font-bold tabular-nums">{code}</span>
              <Button variant="secondary" size="md" onClick={() => onFound(code)}>
                נמצאה
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy}>
        סיום העדכון ורישום החוסר
      </Button>
      <Button variant="quiet" size="md" onClick={onBack}>
        חזרה לסריקה
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/field/receive/[truckId]/ReceiveDone.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { ReceiveResult } from '@/lib/contracts';
import { receiveSummary } from '../logic';

export function ReceiveDone({ result }: { result: ReceiveResult }) {
  const router = useRouter();
  const summary = receiveSummary(result);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>

      <Button onClick={() => router.push('/field/receive')}>קבלת יחידת הובלה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Replace `src/app/field/receive/[truckId]/ReceiveTruck.tsx` entirely**

The scanning block is the one from Task 5; the step state, the submit handler and the two new branches are new.

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Dialog, Spinner, useAction } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import type { ReceiveResult } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS, TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { addCode } from '@/lib/scan-session';
import { classifyReceiveScan, expectedCodes, surplusVerdict, unconfirmedCodes } from '../logic';
import { ReceiveDone } from './ReceiveDone';
import { ReceiveRecheck } from './ReceiveRecheck';

type Step = 'scanning' | 'recheck' | 'done';

export function ReceiveTruck({ truckId }: { truckId: number }) {
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [surplus, setSurplus] = useState<string[]>([]);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [ask, setAsk] = useState<{ code: string; messageHe: string } | null>(null);
  const [step, setStep] = useState<Step>('scanning');
  const [result, setResult] = useState<ReceiveResult | null>(null);
  const { busy, error, run } = useAction();

  const trucks = useSWR('trucks-in-transit', () => api.transportUnits('in_transit'));
  const truck = trucks.data?.find((t) => t.id === truckId) ?? null;
  const expected = truck ? expectedCodes(truck) : [];

  async function scan(raw: string) {
    const scanned = classifyReceiveScan(raw, expected, confirmed, surplus);

    if (scanned.kind === 'confirmed') {
      setConfirmed((prev) => addCode(prev, scanned.code).codes);
      setNote({ tone: 'ok', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'duplicate') {
      setNote({ tone: 'warn', text: scanned.messageHe });
      feedback('success');
      return;
    }
    if (scanned.kind === 'invalid') {
      setNote({ tone: 'danger', text: scanned.messageHe });
      feedback('error');
      return;
    }

    // Not on this truck: ask the server what it is before offering anything.
    const unit = await api.packingUnitByCode(scanned.code).catch(() => null);
    const verdict = surplusVerdict(scanned.code, unit);
    if (verdict.kind === 'reject') {
      setNote({ tone: 'danger', text: verdict.messageHe });
      feedback('error');
      return;
    }
    feedback('error');
    setAsk({ code: scanned.code, messageHe: verdict.messageHe });
  }

  function submit() {
    void run(
      () => api.receiveTransportUnit(truckId, { receivedCodes: confirmed, surplusCodes: surplus }),
      (received) => {
        setResult(received);
        setStep('done');
      },
    );
  }

  if (step === 'done' && result) return <ReceiveDone result={result} />;
  if (trucks.error) return <Banner tone="danger">{describeError(trucks.error).messageHe}</Banner>;
  if (!trucks.data) return <Spinner />;

  if (!truck) {
    return (
      <Card className="text-center">
        <p className="font-bold">יחידת ההובלה אינה בדרך</p>
        <p className="mt-1 text-sm text-ink-muted">ייתכן שכבר נפרקה ושוחררה.</p>
        <Link href="/field/receive" className="mt-4 inline-block text-link">
          חזרה ליחידות ההובלה
        </Link>
      </Card>
    );
  }

  // Recomputed on every render, so a box found during the recheck leaves the list at once.
  const missing = unconfirmedCodes(expected, confirmed);

  if (step === 'recheck') {
    return (
      <ReceiveRecheck
        missing={missing}
        onFound={(code) => {
          setConfirmed((prev) => addCode(prev, code).codes);
          feedback('success');
        }}
        onSubmit={submit}
        onBack={() => setStep('scanning')}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold">
          {TRANSPORT_TYPE_LABELS[truck.type]} {truck.licensePlate}
        </p>
        <p className="text-sm text-ink-muted">סרקו כל אריזה שיורדת מיחידת ההובלה</p>
      </Card>

      <ScanOrType onCode={(code) => void scan(code)} />
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <Card>
        <p className="mb-2 font-bold">אריזות על יחידת ההובלה</p>
        <ul className="flex flex-col gap-2">
          {truck.boxes.map((b) => {
            const on = b.code !== null && confirmed.includes(b.code);
            return (
              <li
                key={b.id}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-card border-2 px-4 ${
                  on ? 'border-primary bg-primary-soft' : 'border-subtle bg-surface'
                }`}
              >
                <span>
                  <span className="block font-bold tabular-nums">{b.code}</span>
                  <span className="block text-sm text-ink-muted">
                    {PACKING_UNIT_TYPE_LABELS[b.type]} · {b.sourceRoomName}
                  </span>
                </span>
                <span aria-hidden className="text-2xl text-primary">
                  {on ? '✓' : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {surplus.length > 0 && (
          <p className="mt-3 text-sm text-warn">התקבלו בעודף: {surplus.join(', ')}</p>
        )}
      </Card>

      <Dialog open={ask !== null} title="אריזה בעודף" onClose={() => setAsk(null)}>
        <p className="mb-4">{ask?.messageHe}</p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              if (!ask) return;
              setSurplus((prev) => addCode(prev, ask.code).codes);
              setNote({ tone: 'warn', text: `אריזה ${ask.code} התקבלה כעודף` });
              feedback('success');
              setAsk(null);
            }}
          >
            כן, לקבל כעודף
          </Button>
          <Button variant="secondary" onClick={() => setAsk(null)}>
            לא
          </Button>
        </div>
      </Dialog>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        {/* spec §5.3.2: the live counter is what the unloader actually watches. */}
        <p className="mb-2 text-center text-lg font-bold tabular-nums">
          {confirmed.length}/{expected.length}
        </p>
        <Button busy={busy} onClick={() => (missing.length > 0 ? setStep('recheck') : submit())}>
          {missing.length > 0 ? `סיום פריקה (${missing.length} חסרות)` : 'סיום פריקה'}
        </Button>
      </div>
    </div>
  );
}
```

When the recheck empties the list entirely, `סיום העדכון ורישום החוסר` still submits — with nothing missing, which is the right outcome.

- [ ] **Step 9: Walk the whole receive flow**

```bash
npm run demo:reset
npm run dev
```

Pack two boxes, load both onto a truck, then receive it:

1. Scan only the first box → `1/2` → `סיום פריקה (1 חסרות)` → the amber recheck with `10002` listed.
2. Press `נמצאה` on `10002` → the list empties → `סיום העדכון` → the green `יחידת הובלה שוחררה` with `התקבלו 2 אריזות`.
3. Reset, repeat, and this time press `סיום העדכון ורישום החוסר` with `10002` still listed → the amber `יחידת הובלה שוחררה עם חוסר` naming `10002`.

Check the write:

```bash
npx prisma studio
```

Expected after run 3: `10002` is `missing`, its `packing_unit_items` rows are `missing`, the truck is `released`, and the second `notifications` row names the missing code. The truck no longer appears at `/field/receive`.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/receive tests/field/scan
git commit -m "feat(receive): recheck missing boxes and release the truck"
```

---

### Task 7: Distribute step 1 — find the box and confirm the room

`flows/distributing_flow.md` nodes D through F, spec §5.4.1–2. The wrong-room guard the distributor persona asks for by name.

**Files:**
- Create: `src/app/field/distribute/page.tsx`, `src/app/field/distribute/DistributeStart.tsx`, `src/app/field/distribute/logic.ts`, `src/app/field/distribute/[code]/page.tsx`, `src/app/field/distribute/[code]/DistributeBox.tsx`, `src/app/field/distribute/[code]/RoomConfirm.tsx`
- Test: `tests/field/distribute/logic.test.ts`

**Interfaces:**
- Consumes: `api.packingUnits({ status: 'received' })`, `api.packingUnitByCode(code)`; `ScanOrType`; P3's kit.
- Produces:
  - `distributeVerdict(code: string, unit: PackingUnitDTO | null): { kind: 'open'; unit: PackingUnitDTO } | { kind: 'reject'; messageHe: string }`
  - `destinationLine(unit: PackingUnitDTO): string`
  - `roomWarning(unit: PackingUnitDTO, atRoom: string): string | null`
  - `needsItemStep(unit: PackingUnitDTO): boolean`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/distribute-open
```

- [ ] **Step 2: Write the failing test** — `tests/field/distribute/logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { PackingUnitDTO, PackingUnitItemDTO, PackingUnitStatus } from '@/lib/contracts';
import {
  destinationLine,
  distributeVerdict,
  needsItemStep,
  roomWarning,
} from '@/app/field/distribute/logic';

const item = (id: number, name: string, quantity: number): PackingUnitItemDTO => ({
  id,
  mappingReportId: id * 10,
  name,
  serial: null,
  quantity,
  distributedQuantity: 0,
  itemStatus: 'received',
});

const unit = (over: Partial<PackingUnitDTO> = {}): PackingUnitDTO => ({
  id: 1,
  code: '10001',
  type: 'professional_carton',
  status: 'received',
  sourceRoomName: 'חדר 101',
  destBuilding: 'בניין 7',
  destFloor: 'קומה 2',
  destRoom: 'חדר 214',
  sourceRoomId: 1,
  groupName: 'ענף תקשוב — מדור מערכות',
  roomManager: 'רס"ל דנה כהן',
  transportUnitId: 1,
  packedByName: 'רב"ט ארז כהן',
  closedAt: new Date(2026, 8, 22, 12, 0).toISOString(),
  items: [item(1, 'מחשב נייד', 2), item(2, 'מסך', 1)],
  ...over,
});

describe('distributeVerdict', () => {
  it('opens a box that was received', () => {
    const v = distributeVerdict('10001', unit());
    expect(v.kind).toBe('open');
  });

  it('refuses a code that does not exist', () => {
    expect(distributeVerdict('99999', null)).toEqual({ kind: 'reject', messageHe: 'אריזה 99999 לא נמצאה' });
  });

  it.each<PackingUnitStatus>(['closed', 'in_transit', 'missing', 'distributed', 'distributed_short'])(
    'refuses a box in status %s and names that status in Hebrew',
    (status) => {
      expect(distributeVerdict('10001', unit({ status }))).toMatchObject({
        kind: 'reject',
        messageHe: expect.stringContaining('ניתן לפזר רק אריזה שהתקבלה'),
      });
    },
  );
});

describe('destinationLine', () => {
  it('reads building, floor and room in one line', () => {
    expect(destinationLine(unit())).toBe('בניין 7 · קומה 2 · חדר 214');
  });

  it('marks a part that is missing rather than printing null', () => {
    expect(destinationLine(unit({ destFloor: null }))).toBe('בניין 7 · — · חדר 214');
  });
});

describe('roomWarning', () => {
  it('says nothing while the room has not been confirmed', () => {
    expect(roomWarning(unit(), '')).toBeNull();
    expect(roomWarning(unit(), '   ')).toBeNull();
  });

  it('says nothing when the distributor is in the box destination room', () => {
    expect(roomWarning(unit(), 'חדר 214')).toBeNull();
    expect(roomWarning(unit(), '  חדר 214 ')).toBeNull();
  });

  // The distributor persona: "המערכת חייבת להתריע לי אם הארגז הזה מיועד לקומה אחרת".
  it('warns when the distributor is somewhere else, and still allows it', () => {
    expect(roomWarning(unit(), 'חדר 999')).toBe('האריזה מיועדת לחדר 214 — ודאו שאתם בחדר הנכון');
  });

  it('says nothing when the box has no destination room on file', () => {
    expect(roomWarning(unit({ destRoom: null }), 'חדר 999')).toBeNull();
  });
});

describe('needsItemStep', () => {
  // A personal carton has no packing_unit_items rows at all (spec §3).
  it('skips the item step for a box with no contents', () => {
    expect(needsItemStep(unit({ type: 'personal_carton', items: [] }))).toBe(false);
  });

  it('asks for the item step for a box with contents', () => {
    expect(needsItemStep(unit())).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/field/distribute/logic.test.ts
```

Expected: FAIL with `Cannot find module '@/app/field/distribute/logic'`.

- [ ] **Step 4: Write `src/app/field/distribute/logic.ts`**

```ts
import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_STATUS_LABELS } from '@/lib/labels';

/** Only a box that was received may be distributed (spec §5.4.1). */
export function distributeVerdict(
  code: string,
  unit: PackingUnitDTO | null,
): { kind: 'open'; unit: PackingUnitDTO } | { kind: 'reject'; messageHe: string } {
  if (!unit) return { kind: 'reject', messageHe: `אריזה ${code} לא נמצאה` };
  if (unit.status !== 'received') {
    return {
      kind: 'reject',
      messageHe: `אריזה ${code} בסטטוס "${PACKING_UNIT_STATUS_LABELS[unit.status]}" — ניתן לפזר רק אריזה שהתקבלה`,
    };
  }
  return { kind: 'open', unit };
}

const or = (value: string | null) => value ?? '—';

export function destinationLine(unit: PackingUnitDTO): string {
  return `${or(unit.destBuilding)} · ${or(unit.destFloor)} · ${or(unit.destRoom)}`;
}

/**
 * The wrong-room guard (spec §5.4.2). A warning, never a block — the distributor
 * may be right and the label wrong, and the override is recorded in the event note.
 */
export function roomWarning(unit: PackingUnitDTO, atRoom: string): string | null {
  const here = atRoom.trim();
  if (!here || !unit.destRoom) return null;
  if (here === unit.destRoom.trim()) return null;
  return `האריזה מיועדת ל${unit.destRoom} — ודאו שאתם בחדר הנכון`;
}

/**
 * A personal carton is sealed and has no item rows, so there is nothing to tick
 * (flows/distributing_flow.md note Fn). Recognised by its empty contents rather
 * than its type, so this module never reaches into the packing flow's code.
 */
export function needsItemStep(unit: PackingUnitDTO): boolean {
  return unit.items.length > 0;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/field/distribute/logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/distribute/page.tsx` and `DistributeStart.tsx`**

```tsx
// src/app/field/distribute/page.tsx
import { DistributeStart } from './DistributeStart';

export const dynamic = 'force-dynamic';

export default function DistributePage() {
  return <DistributeStart />;
}
```

```tsx
// src/app/field/distribute/DistributeStart.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Card, describeError, EmptyState, OptionList, Spinner } from '@/components/ui';
import { ScanOrType } from '@/components/ScanOrType';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { feedback } from '@/lib/feedback';
import { normalizeCode } from '@/lib/scan-session';

export function DistributeStart() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const boxes = useSWR('boxes-received', () => api.packingUnits({ status: 'received' }));

  function open(raw: string) {
    const code = normalizeCode(raw);
    if (!code) {
      setNote('יש להזין מספר אריזה בן 5 ספרות');
      feedback('error');
      return;
    }
    // The box page does the lookup and reports anything wrong with it.
    router.push(`/field/distribute/${code}`);
  }

  if (boxes.error) return <Banner tone="danger">{describeError(boxes.error).messageHe}</Banner>;

  return (
    <div className="flex flex-col gap-4">
      <ScanOrType onCode={open} hint="סרקו את מדבקת האריזה או הקלידו את מספרה" />
      {note && <Banner tone="danger">{note}</Banner>}

      {!boxes.data ? (
        <Spinner />
      ) : boxes.data.length === 0 ? (
        <EmptyState title="אין כרגע אריזות שהתקבלו" body="אריזות שיתקבלו ביחידת הובלה יופיעו כאן לפיזור." />
      ) : (
        <Card>
          <p className="mb-2 font-bold">אריזות שהתקבלו</p>
          <OptionList
            options={boxes.data
              .filter((b) => b.code !== null)
              .map((b) => ({
                value: b.code as string,
                label: b.code as string,
                hint: `${PACKING_UNIT_TYPE_LABELS[b.type]} · ${b.destRoom ?? '—'}`,
              }))}
            value={null}
            onChange={open}
          />
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/field/distribute/[code]/page.tsx`**

```tsx
import { DistributeBox } from './DistributeBox';

export const dynamic = 'force-dynamic';

export default async function DistributeBoxPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DistributeBox code={code} />;
}
```

- [ ] **Step 8: Write `src/app/field/distribute/[code]/RoomConfirm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Banner, Button, Card, TextField } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { destinationLine, roomWarning } from '../logic';

export function RoomConfirm({
  unit,
  atRoom,
  onChange,
  onConfirm,
}: {
  unit: PackingUnitDTO;
  atRoom: string;
  onChange: (room: string) => void;
  onConfirm: () => void;
}) {
  const [elsewhere, setElsewhere] = useState(false);
  const warning = roomWarning(unit, atRoom);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-3xl font-bold tabular-nums">{unit.code}</p>
        <p className="mt-1 font-bold">{destinationLine(unit)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {PACKING_UNIT_TYPE_LABELS[unit.type]} · {unit.items.length} פריטים · נארז ב{unit.sourceRoomName}
        </p>
      </Card>

      {!elsewhere ? (
        <Card className="flex flex-col gap-3">
          <p className="font-bold">באיזה חדר אתם נמצאים?</p>
          <Button
            onClick={() => {
              onChange(unit.destRoom ?? '');
              onConfirm();
            }}
            disabled={!unit.destRoom}
          >
            אני ב{unit.destRoom ?? 'חדר היעד'}
          </Button>
          <Button variant="secondary" onClick={() => setElsewhere(true)}>
            אני בחדר אחר
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <TextField label="החדר שאני נמצא בו" value={atRoom} onChange={onChange} autoFocus />
          {warning && <Banner tone="warn">{warning}</Banner>}
          <Button onClick={onConfirm} disabled={atRoom.trim().length === 0}>
            המשך לפיזור
          </Button>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Write `src/app/field/distribute/[code]/DistributeBox.tsx`**

Task 8 adds the item, recheck and done steps; this version gets the lookup and the room confirmation right.

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Banner, Card, describeError, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { distributeVerdict } from '../logic';
import { RoomConfirm } from './RoomConfirm';

export function DistributeBox({ code }: { code: string }) {
  const [atRoom, setAtRoom] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const box = useSWR(['box', code], () => api.packingUnitByCode(code).catch(() => null));

  if (box.error) return <Banner tone="danger">{describeError(box.error).messageHe}</Banner>;
  if (box.data === undefined) return <Spinner />;

  const verdict = distributeVerdict(code, box.data);
  if (verdict.kind === 'reject') {
    return (
      <Card className="text-center">
        <p className="font-bold">{verdict.messageHe}</p>
        <Link href="/field/distribute" className="mt-4 inline-block text-link">
          חזרה לבחירת אריזה
        </Link>
      </Card>
    );
  }

  if (!confirmed) {
    return (
      <RoomConfirm
        unit={verdict.unit}
        atRoom={atRoom}
        onChange={setAtRoom}
        onConfirm={() => setConfirmed(true)}
      />
    );
  }

  // Task 8 replaces this with the item step.
  return <Banner tone="info">{`אתם ב${atRoom}. המשך התהליך נבנה במשימה הבאה.`}</Banner>;
}
```

- [ ] **Step 10: Walk the screen**

```bash
npm run demo:reset
npm run dev
```

Pack a box, load it, receive it. At `/field/distribute`: the received box appears in the list. Tap it → the box card shows the code, `בניין 7 · קומה 2 · חדר 214` and the item count. Press `אני בחדר 214` → the placeholder banner. Go back, press `אני בחדר אחר`, type `חדר 999` → the amber `האריזה מיועדת לחדר 214` warning, and `המשך לפיזור` still works. Type `99999` into the scan field → the `לא נמצאה` card. Scan a box that is still `closed` → the card names its status in Hebrew.

- [ ] **Step 11: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/distribute tests/field/distribute
git commit -m "feat(distribute): find a received box and confirm the room"
```

---

### Task 8: Distribute step 2 — hand the items over, recheck, submit

`flows/distributing_flow.md` nodes G through M, spec §5.4.3–5. Review Focus 5 lives here.

**Files:**
- Create: `src/app/field/distribute/[code]/ItemHandover.tsx`, `src/app/field/distribute/[code]/DistributeRecheck.tsx`, `src/app/field/distribute/[code]/DistributeDone.tsx`
- Modify: `src/app/field/distribute/[code]/DistributeBox.tsx` (step machine), `src/app/field/distribute/logic.ts` (append), `tests/field/distribute/logic.test.ts` (append)

**Interfaces:**
- Consumes: Task 7's helpers; `api.distributePackingUnit(id, req)`; `Stepper` from `@/components/ui`.
- Produces:
  - `maxFor(item: PackingUnitItemDTO): number`
  - `emptyDraft(items: PackingUnitItemDTO[]): Record<number, number>`
  - `fullDraft(items: PackingUnitItemDTO[]): Record<number, number>`
  - `shortfall(items: PackingUnitItemDTO[], draft: Record<number, number>): { item: PackingUnitItemDTO; missing: number }[]`
  - `distributeRequest(draft: Record<number, number>, atRoom: string): DistributeReq`
  - `distributeSummary(unit: PackingUnitDTO): { title: string; tone: 'ok' | 'warn'; lines: string[] }`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p4/distribute-items
```

- [ ] **Step 2: Append the failing tests to `tests/field/distribute/logic.test.ts`**

```ts
import {
  distributeRequest,
  distributeSummary,
  emptyDraft,
  fullDraft,
  maxFor,
  shortfall,
} from '@/app/field/distribute/logic';

describe('maxFor', () => {
  it('is everything the box still holds', () => {
    expect(maxFor(item(1, 'מחשב נייד', 2))).toBe(2);
  });

  it('subtracts anything already handed over', () => {
    expect(maxFor({ ...item(1, 'מחשב נייד', 2), distributedQuantity: 1 })).toBe(1);
  });

  it('never goes below zero', () => {
    expect(maxFor({ ...item(1, 'מחשב נייד', 1), distributedQuantity: 3 })).toBe(0);
  });
});

describe('drafts', () => {
  // Conventions #5: zero by default, so nothing is confirmed that was not looked at.
  it('starts every item at zero', () => {
    expect(emptyDraft(unit().items)).toEqual({ 1: 0, 2: 0 });
  });

  it('fills every item to its maximum in one tap', () => {
    expect(fullDraft(unit().items)).toEqual({ 1: 2, 2: 1 });
  });
});

describe('shortfall', () => {
  it('is empty when everything was handed over', () => {
    expect(shortfall(unit().items, { 1: 2, 2: 1 })).toEqual([]);
  });

  it('names each item that is short and by how much', () => {
    const short = shortfall(unit().items, { 1: 1, 2: 1 });
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ missing: 1 });
    expect(short[0].item.name).toBe('מחשב נייד');
  });

  it('counts an item nobody ticked as entirely short', () => {
    expect(shortfall(unit().items, {}).map((s) => s.missing)).toEqual([2, 1]);
  });
});

describe('distributeRequest', () => {
  it('sends only what was actually handed over, with the room trimmed', () => {
    expect(distributeRequest({ 1: 2, 2: 0 }, '  חדר 214 ')).toEqual({
      items: [{ packingUnitItemId: 1, quantity: 2 }],
      atRoom: 'חדר 214',
    });
  });

  // Review Focus 5: an empty list is a real request, not a blocked one.
  it('sends an empty list when nothing was handed over', () => {
    expect(distributeRequest({ 1: 0 }, 'חדר 214')).toEqual({ items: [], atRoom: 'חדר 214' });
  });
});

describe('distributeSummary', () => {
  it('reports a box that was fully distributed', () => {
    const s = distributeSummary(unit({ status: 'distributed' }));
    expect(s).toMatchObject({ title: 'האריזה פוזרה במלואה', tone: 'ok' });
  });

  it('names every short item and turns the summary amber', () => {
    const s = distributeSummary(
      unit({
        status: 'distributed_short',
        items: [
          { ...item(1, 'מחשב נייד', 2), distributedQuantity: 1, itemStatus: 'short' },
          { ...item(2, 'מסך', 1), distributedQuantity: 1, itemStatus: 'distributed' },
        ],
      }),
    );
    expect(s).toMatchObject({ title: 'האריזה פוזרה עם חוסר', tone: 'warn' });
    expect(s.lines).toContain('מחשב נייד: פוזרו 1 מתוך 2');
    expect(s.lines.join(' ')).not.toContain('מסך');
  });

  // Review Focus 5: the same empty request means "distributed" for a personal carton.
  it('reports a personal carton as fully distributed, with no item lines', () => {
    const s = distributeSummary(unit({ type: 'personal_carton', status: 'distributed', items: [] }));
    expect(s).toMatchObject({ title: 'האריזה פוזרה במלואה', tone: 'ok' });
    expect(s.lines).toEqual(['מספר אריזה: 10001']);
  });

  it('does not guess a status the server did not return', () => {
    const s = distributeSummary(unit({ status: 'received' }));
    expect(s.tone).toBe('warn');
    expect(s.title).toBe('הפיזור לא הושלם');
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

```bash
npm test -- tests/field/distribute/logic.test.ts
```

Expected: FAIL — the six new functions are not exported yet.

- [ ] **Step 4: Append to `src/app/field/distribute/logic.ts`**

Merge the new type imports into the file's existing `import type { ... } from '@/lib/contracts'` line.

```ts
import type { DistributeReq, PackingUnitItemDTO } from '@/lib/contracts';

/** How much of this item is still in the box. */
export function maxFor(item: PackingUnitItemDTO): number {
  return Math.max(0, item.quantity - item.distributedQuantity);
}

/**
 * Nothing is handed over until the distributor says so (Conventions #5).
 * Prefilling would mean a box nobody looked into is recorded as fully distributed.
 */
export function emptyDraft(items: PackingUnitItemDTO[]): Record<number, number> {
  return Object.fromEntries(items.map((i) => [i.id, 0]));
}

/** The "פוזר הכל" shortcut: everything in the box, in one tap. */
export function fullDraft(items: PackingUnitItemDTO[]): Record<number, number> {
  return Object.fromEntries(items.map((i) => [i.id, maxFor(i)]));
}

/** What is about to be recorded as short (flows/distributing_flow.md nodes J–K). */
export function shortfall(
  items: PackingUnitItemDTO[],
  draft: Record<number, number>,
): { item: PackingUnitItemDTO; missing: number }[] {
  return items
    .map((item) => ({ item, missing: maxFor(item) - (draft[item.id] ?? 0) }))
    .filter((row) => row.missing > 0);
}

export function distributeRequest(draft: Record<number, number>, atRoom: string): DistributeReq {
  return {
    items: Object.entries(draft)
      .filter(([, quantity]) => quantity > 0)
      .map(([packingUnitItemId, quantity]) => ({ packingUnitItemId: Number(packingUnitItemId), quantity })),
    atRoom: atRoom.trim(),
  };
}

/**
 * The closing screen. Driven by the status the server returned — an empty request
 * means `distributed` for a personal carton and `distributed_short` for a box with
 * contents, and only the server knows which happened.
 */
export function distributeSummary(unit: PackingUnitDTO): {
  title: string;
  tone: 'ok' | 'warn';
  lines: string[];
} {
  const lines = [`מספר אריזה: ${unit.code ?? '—'}`];

  if (unit.status === 'distributed') {
    return { title: 'האריזה פוזרה במלואה', tone: 'ok', lines };
  }

  if (unit.status === 'distributed_short') {
    for (const i of unit.items.filter((i) => i.itemStatus === 'short')) {
      lines.push(`${i.name}: פוזרו ${i.distributedQuantity} מתוך ${i.quantity}`);
    }
    return { title: 'האריזה פוזרה עם חוסר', tone: 'warn', lines };
  }

  // Should not happen. Say so rather than claiming a success nobody confirmed.
  return { title: 'הפיזור לא הושלם', tone: 'warn', lines };
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- tests/field/distribute/logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/app/field/distribute/[code]/ItemHandover.tsx`**

```tsx
'use client';

import { Button, Card, Stepper } from '@/components/ui';
import type { PackingUnitItemDTO } from '@/lib/contracts';
import { maxFor } from '../logic';

export function ItemHandover({
  items,
  draft,
  onChange,
  onAll,
}: {
  items: PackingUnitItemDTO[];
  draft: Record<number, number>;
  onChange: (itemId: number, quantity: number) => void;
  onAll: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={onAll}>
        פוזר הכל
      </Button>
      {items.map((i) => (
        <Card key={i.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{i.name}</p>
              <p className="text-sm text-ink-muted">
                {i.serial && `מק"ט ${i.serial} · `}
                {maxFor(i)} באריזה
              </p>
            </div>
            <Stepper
              label={i.name}
              value={draft[i.id] ?? 0}
              max={maxFor(i)}
              onChange={(n) => onChange(i.id, n)}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/field/distribute/[code]/DistributeRecheck.tsx`**

```tsx
'use client';

import { Banner, Button, Card } from '@/components/ui';
import type { PackingUnitItemDTO } from '@/lib/contracts';

/**
 * flows/distributing_flow.md nodes J–L: the shortfall is shown, item by item,
 * before anything is written — and the distributor can go back and look again.
 */
export function DistributeRecheck({
  short,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  short: { item: PackingUnitItemDTO; missing: number }[];
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warn" title="שים לב, לא כל הפריטים פוזרו">
        הפריטים הבאים יירשמו בחוסר. כדאי לבדוק שוב בתוך האריזה לפני סיום.
      </Banner>

      <Card>
        <ul className="flex flex-col gap-2">
          {short.map(({ item, missing }) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-subtle py-2 last:border-0">
              <span className="font-bold">{item.name}</span>
              <span className="text-sm text-warn">חסרים {missing}</span>
            </li>
          ))}
        </ul>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      <Button onClick={onSubmit} busy={busy}>
        סיום העדכון ורישום החוסר
      </Button>
      <Button variant="quiet" size="md" onClick={onBack}>
        חזרה לסימון הפריטים
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Write `src/app/field/distribute/[code]/DistributeDone.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import type { PackingUnitDTO } from '@/lib/contracts';
import { distributeSummary } from '../logic';

export function DistributeDone({ unit }: { unit: PackingUnitDTO }) {
  const router = useRouter();
  const summary = distributeSummary(unit);

  return (
    <div className="flex flex-col gap-4">
      <Banner tone={summary.tone} title={summary.title}>
        {summary.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
      {summary.tone === 'warn' && <p className="text-sm text-white/80">נשלחה הודעת SMS לרשימת התפוצה.</p>}

      <Button onClick={() => router.push('/field/distribute')}>פיזור אריזה נוספת</Button>
      <Button variant="quiet" size="md" onClick={() => router.push('/field')}>
        חזרה למסך הראשי
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Replace `src/app/field/distribute/[code]/DistributeBox.tsx` entirely**

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, Button, Card, describeError, Spinner, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO } from '@/lib/contracts';
import {
  distributeRequest,
  distributeVerdict,
  emptyDraft,
  fullDraft,
  needsItemStep,
  shortfall,
} from '../logic';
import { DistributeDone } from './DistributeDone';
import { DistributeRecheck } from './DistributeRecheck';
import { ItemHandover } from './ItemHandover';
import { RoomConfirm } from './RoomConfirm';

type Step = 'room' | 'items' | 'recheck' | 'done';

export function DistributeBox({ code }: { code: string }) {
  const [atRoom, setAtRoom] = useState('');
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [step, setStep] = useState<Step>('room');
  const [result, setResult] = useState<PackingUnitDTO | null>(null);
  const { busy, error, run } = useAction();

  const box = useSWR(['box', code], () => api.packingUnitByCode(code).catch(() => null));
  const unit = box.data ?? null;

  useEffect(() => {
    if (unit) setDraft(emptyDraft(unit.items));
  }, [unit]);

  function submit(id: number) {
    void run(
      () => api.distributePackingUnit(id, distributeRequest(draft, atRoom)),
      (distributed) => {
        setResult(distributed);
        setStep('done');
      },
    );
  }

  if (box.error) return <Banner tone="danger">{describeError(box.error).messageHe}</Banner>;
  if (box.data === undefined) return <Spinner />;
  if (step === 'done' && result) return <DistributeDone unit={result} />;

  const verdict = distributeVerdict(code, unit);
  if (verdict.kind === 'reject') {
    return (
      <Card className="text-center">
        <p className="font-bold">{verdict.messageHe}</p>
        <Link href="/field/distribute" className="mt-4 inline-block text-link">
          חזרה לבחירת אריזה
        </Link>
      </Card>
    );
  }

  const open = verdict.unit;
  const short = shortfall(open.items, draft);

  if (step === 'room') {
    return (
      <RoomConfirm
        unit={open}
        atRoom={atRoom}
        onChange={setAtRoom}
        // A personal carton has nothing to tick — straight to the write (flow note Fn).
        onConfirm={() => (needsItemStep(open) ? setStep('items') : submit(open.id))}
      />
    );
  }

  if (step === 'recheck') {
    return (
      <DistributeRecheck
        short={short}
        onSubmit={() => submit(open.id)}
        onBack={() => setStep('items')}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="font-bold tabular-nums">{open.code}</p>
        <p className="text-sm text-ink-muted">מפזרים ב{atRoom}</p>
      </Card>

      <ItemHandover
        items={open.items}
        draft={draft}
        onChange={(itemId, quantity) => setDraft((d) => ({ ...d, [itemId]: quantity }))}
        onAll={() => setDraft(fullDraft(open.items))}
      />

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="sticky bottom-0 -mx-4 border-t border-subtle bg-surface p-4">
        <Button busy={busy} onClick={() => (short.length > 0 ? setStep('recheck') : submit(open.id))}>
          {short.length > 0 ? `סיום פיזור (${short.length} בחוסר)` : 'סיום פיזור הפריטים'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Walk the whole distribute flow three ways**

```bash
npm run demo:reset
npm run dev
```

1. **Everything distributed.** Pack → load → receive a box with two items, then distribute it: confirm the room, `פוזר הכל`, `סיום פיזור הפריטים` → green `האריזה פוזרה במלואה`.
2. **One item short.** Same, but leave one laptop unticked → `סיום פיזור (1 בחוסר)` → the amber recheck naming it → `סיום העדכון` → amber `האריזה פוזרה עם חוסר` with `מחשב נייד: פוזרו 1 מתוך 2`.
3. **A personal carton.** Pack, load and receive one, then distribute it: the room confirmation is followed immediately by the green `האריזה פוזרה במלואה` with no item step at all.

Check the writes:

```bash
npx prisma studio
```

Expected after run 2: the box is `distributed_short`, the laptop item is `short` with `distributed_quantity = 1`, the monitor is `distributed`, and a `notifications` row names `מחשב נייד`. After run 3: the personal carton is `distributed` with no item rows and no notification.

- [ ] **Step 11: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/field/distribute tests/field/distribute
git commit -m "feat(distribute): hand items over, recheck the shortfall, submit"
```

---

### Task 9: Integration — three legs of the demo on real phones (H5 → H20)

P4 owns steps 2, 3 and 4 of the demo script (`docs/generated/plan.md` §7). This is where they stop being three separate merges and become one chain.

**Files:** `docs/generated/notes.md` (append — P1 owns the file; append a `## P4` section rather than restructuring it).

- [ ] **Step 1: Run the chain on the deployed URL, on three different phones**

Reset the deployed database, then have P3 pack two boxes in room 101 and print or photograph both labels. Then:

1. **Phone 2 (transporter):** `/field` → `העמסה והובלה` → new truck `12-345-67` → scan both labels → `סיום העמסה`. Expect the plate, `2 אריזות` and the departure time, and a new SMS row on P5's dashboard.
2. **Phone 3 (unloader):** `/field` → `קבלת ציוד` → the truck appears → scan **only the first label** → `סיום פריקה (1 חסרות)` → the warning and the recheck list → `סיום העדכון ורישום החוסר`. Expect the amber summary naming the missing code, and the missing box plus its SMS on the dashboard.
3. **Phone 4 (distributor):** `/field` → `פיזור ציוד` → scan the received label → confirm `חדר 214` → leave one item unticked → the shortfall warning → submit. Expect the amber summary and the exception on the dashboard.

These three beats are the demo. If any of them needs a retry on the day, the retry is what the audience will remember — run it until all three work first time.

- [ ] **Step 2: Scan a real label with a real camera, in the real room**

The single highest-risk thing in this workstream. Check all of it:

- The printed label scans from about 30cm, at an angle, in the room's actual lighting.
- The phone's own screen brightness is enough to scan a label displayed on another phone (the fallback when nothing is printed).
- The camera keeps working after ten boxes in a row — no leaked `Html5Qrcode` instance, no frozen preview after navigating away and back.
- Denying the camera on one phone and running its whole leg on the keypad still completes.
- The success and error tones are audible over the room.

- [ ] **Step 3: Check what a second phone does to the first**

Two people scanning the same truck at once is a real demo risk: SWR caches the truck and the closed-box list. Open the same truck on two phones, load a box on one, and confirm the other either sees it or fails with a Hebrew message rather than silently sending a stale code. If it is silent, add `refreshInterval: 5000` to the affected `useSWR` call and re-test.

- [ ] **Step 4: Read every Hebrew string out loud**

Every screen P4 owns, in order. Two must appear verbatim, because they come from the source flows and the audience knows them: `שים לב, לא כל האריזות נפרקו` and `שים לב, לא כל הפריטים פוזרו`.

- [ ] **Step 5: Append what you learned to `docs/generated/notes.md`**

```markdown
## P4 — scanning, load, receive, distribute

- Scanning: `<ScanOrType onCode={...} />` — camera plus keypad, hands back normalized 5-digit codes.
- The camera needs HTTPS. On the deployed URL it works; over plain HTTP from a phone it falls back to the keypad.
- Every flow sends exactly one write, at the end. A scan is validated when it is scanned, never at submit.
- Surplus at receive is only offered for a box that is `in_transit` — anything else would fail the whole unload.
- Known shortcut: no offline mode, which the distributor persona asks for. Call it out in the demo.
- <anything else the rehearsals turned up>
```

- [ ] **Step 6: Commit**

```bash
git add docs/generated/notes.md
git commit -m "docs: P4 integration notes"
```

---

## What P4 does not build

- **The packing flow, the UI kit, the field shell and the QR label.** P3. If a kit component is missing something, ask P3 to add it — do not fork a second button style into `src/app/field/load/**`.
- **Anything under `/command`.** P5.
- **Any status change.** Every screen here calls `api` and renders what comes back. If a screen seems to need a status write of its own, it needs a lifecycle change: ask P2.
- **Changes to `contracts.ts`, `labels.ts`, `errors.ts`, `api/client.ts` or the Prisma schema.** P1 owns them and they are frozen. If a screen needs a field the DTO lacks, ask in chat.
- **Offline mode.** Out of scope for the MVP (spec §1) even though the distributor persona asks for it. Mention it in the demo as known and deliberate, not as an oversight.
