# RBAC Command Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-tier rank hierarchy (Unit Commander → Ra'an → Ramad → Soldier), orthogonal to the existing operational `role` field, with self-assign subordinates, rank promotion/demotion, cycle/escalation guards, and a "my team" commander view scoped to a user's full recursive subtree.

**Architecture:** One new self-referential column pair on `User` (`rank`, `commanderId`), one new pure/query module `src/lib/command.ts` holding every authorization rule and subtree walk, four thin API routes over it, and one new page (`/command/team`) built from the existing UI kit. Nothing here touches the existing `role` field, the existing global `/command` dashboard (`DashboardDTO`), or any file owned by another workstream beyond additive edits.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 6 + PostgreSQL, Zod, Vitest 3 (node environment, real test DB via `.env.test`).

**Spec:** `docs/generated/2026-09-23-rbac-hierarchy-design.md`

## Global Constraints

- Hackathon MVP: prefer quick and demoable; mark every shortcut with `// TODO:` and a reason.
- Code, identifiers and comments in **English**. Every user-facing string in **Hebrew**. UI is RTL.
- UI never uses a hex literal — use the kit's tokens (`bg-primary`, `bg-primary-soft`, `text-ink`, `text-ink-muted`, `rounded-card`, `border-subtle`, etc.) and components from `@/components/ui`.
- API errors are always `{ error: ErrorCode, messageHe: string }` via `handle()` from `@/lib/api/respond`. Every route calls `requireActor()` first.
- Next.js 15 route params are async: `{ params }: { params: Promise<{ id: string }> }`.
- `rank` is fully orthogonal to `role` — this plan never reads or writes `role`, and never touches `src/lib/dashboard.ts`, `src/lib/timeline.ts`, or anything under `src/app/command` that isn't the new `team` subfolder.
- The rank tree has no relationship to `Group` — no `groupId` on the new relation, no `Group` lookups anywhere in this plan.
- Any commander (rank ≠ `soldier`) self-assigns a subordinate; no separate admin-approval step exists.
- A commander's view is their full recursive subtree, not just direct reports.
- Rank is granted only by a strictly higher rank (`RANK_LEVEL[newRank] < RANK_LEVEL[actor.rank]`), never self-selected.
- Out of scope (do not build): reassigning orphaned subordinates up the chain on downgrade (they are orphaned, full stop); any UI/API for the very first `unit_commander` bootstrap beyond the seed script; a user-directory search endpoint (the "assign subordinate" UI takes a numeric user id, `// TODO`-flagged); a rank-change audit trail; automated UI tests (none exist elsewhere in this repo either).
- Tests run against the real test database via `tests/setup.ts` / `.env.test`, using the `beforeEach(resetDb)` pattern already used throughout `tests/lib/*.test.ts`.

## Review Focus

1. **Promoting to your own exact rank, not just higher.** `raan` (level 2) tries to set someone to `raan` (level 2) — an off-by-one in the level comparison (`<=` vs `<`) would let this through. → Task 2.
2. **Removing a subordinate who is not a direct report.** A `raan` tries to `removeSubordinate` on a soldier who reports to one of their ramads (a grandchild). Must reject, not silently detach the wrong link or no-op. → Task 2.
3. **Reassigning an already-assigned subordinate.** A soldier already under Ramad A gets `assignSubordinate`'d by Ramad B. Must succeed and overwrite the link, not throw a spurious "already has a commander" error nobody asked for. → Task 2.
4. **Downgrading someone with zero subordinates.** A `ramad` with no soldiers assigned gets demoted to `soldier`. The orphan-cascade `updateMany` must be a harmless no-op on an empty match set, not throw. → Task 2.
5. **An empty subtree.** A freshly promoted `ramad` with nobody assigned yet calls `getSubordinateStatuses`. Must return `[]`, not throw and not return `null`. → Task 2.

---

### Task 1: Data model — schema, contracts, labels, errors, session, seed

Pure scaffolding: the column pair, the shared types, and the plumbing every later task reads. No new runtime behavior to unit-test yet — verified by a clean migration and a clean type-check.

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model)
- Modify: `src/lib/contracts.ts`
- Modify: `src/lib/labels.ts`
- Modify: `src/lib/errors.ts`
- Modify: `src/lib/session.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: `Rank`, `RANKS`, `RANK_LEVEL`, `SubordinateStatusDTO`, `AssignSubordinateReq`, `SetRankReq` (contracts.ts); `RANK_LABELS` (labels.ts); `Errors.forbidden(messageHe)` → `AppError` with code `'FORBIDDEN'`, status 403 (errors.ts); `Actor.rank: Rank` (session.ts) — every later task consumes these exact names.

- [ ] **Step 1: Branch**

```bash
git checkout rbac/hierarchy
```

(Already created and checked out from the spec commit — confirm with `git branch --show-current` before continuing.)

- [ ] **Step 2: Extend `prisma/schema.prisma`**

Add these four lines inside the existing `model User { ... }` block (after `identityNum`, before `createdAt` — order inside the model doesn't matter to Prisma, but keep new fields grouped together for readability), and the two relation fields alongside the other relation fields at the bottom of the model:

```prisma
model User {
  id                Int             @id @default(autoincrement())
  email             String          @unique
  name              String
  /// packer | transporter | unloader | distributor | commander (null until picked)
  role              String?
  /// soldier | ramad | raan | unit_commander
  rank              String          @default("soldier")
  commanderId       Int?            @map("commander_id")
  commander         User?           @relation("CommandChain", fields: [commanderId], references: [id])
  subordinates      User[]          @relation("CommandChain")
  identityNum       String?         @map("identity_num") @db.VarChar(10)
  createdAt         DateTime        @default(now()) @map("created_at")
  packedUnits       PackingUnit[]   @relation("PackedBy")
  createdTransports TransportUnit[] @relation("CreatedBy")
  events            StatusEvent[]

  @@map("users")
}
```

- [ ] **Step 3: Create and apply the migration**

```bash
npx prisma migrate dev --name add_rank_hierarchy
```

Expected: a new folder under `prisma/migrations/` containing `ALTER TABLE "users" ADD COLUMN "rank" ... ADD COLUMN "commander_id" ...`, applied with no errors, Prisma Client regenerated.

- [ ] **Step 4: Extend `src/lib/contracts.ts`**

Add near the other role/status const+type pairs (after the `ROLES`/`Role` block):

```ts
export const RANKS = ['soldier', 'ramad', 'raan', 'unit_commander'] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LEVEL: Record<Rank, number> = {
  soldier: 0,
  ramad: 1,
  raan: 2,
  unit_commander: 3,
};
```

Add `'FORBIDDEN'` to the `ErrorCode` union:

```ts
export type ErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'NOT_ON_THIS_TRUCK'
  | 'QUANTITY_EXCEEDS_REMAINING'
  | 'ROOM_NOT_MAPPED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL';
```

Add near the other DTOs and Requests (bottom of the file):

```ts
export interface SubordinateStatusDTO {
  id: number;
  name: string;
  email: string;
  rank: Rank;
  role: Role | null;
  lastActivityAt: string | null;
  lastActivityLabel: string | null;
}

export interface AssignSubordinateReq {
  subordinateId: number;
}
export interface SetRankReq {
  userId: number;
  rank: Rank;
}
```

- [ ] **Step 5: Extend `src/lib/labels.ts`**

Add the import and the map, next to `ROLE_LABELS`:

```ts
import type {
  ItemStatus, MappingStatus, PackingUnitStatus, PackingUnitType, Rank, Role, RoomStatus,
  TransportStatus, TransportType,
} from './contracts';

export const RANK_LABELS: Record<Rank, string> = {
  soldier: 'חייל',
  ramad: 'רמ"ד',
  raan: 'רע"נ',
  unit_commander: 'מפקד יחידה',
};
```

(This only adds `Rank` to the existing type-only import line and inserts the new const — don't duplicate the import.)

- [ ] **Step 6: Extend `src/lib/errors.ts`**

Add one entry to the `Errors` object:

```ts
export const Errors = {
  illegalTransition: (fromLabel: string, toLabel: string) =>
    new AppError('ILLEGAL_TRANSITION', `לא ניתן לעבור מ"${fromLabel}" ל"${toLabel}"`, 409),
  notOnThisTruck: (code: string) =>
    new AppError('NOT_ON_THIS_TRUCK', `אריזה ${code} לא הועמסה על יחידת הובלה זו`, 409),
  quantityExceeds: (itemName: string, max: number) =>
    new AppError('QUANTITY_EXCEEDS_REMAINING', `הכמות עבור "${itemName}" גדולה מהמותר (${max})`, 409),
  roomNotMapped: () => new AppError('ROOM_NOT_MAPPED', 'יש לסיים את המיפוי', 409),
  notFound: (what: string) => new AppError('NOT_FOUND', `${what} לא נמצא`, 404),
  validation: (messageHe: string) => new AppError('VALIDATION', messageHe, 400),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'יש להתחבר מחדש', 401),
  forbidden: (messageHe: string) => new AppError('FORBIDDEN', messageHe, 403),
};
```

- [ ] **Step 7: Extend `src/lib/session.ts`**

```ts
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Rank, Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
  rank: Rank;
}

export const DEV_EMAIL = 'dev@maabara.local';

export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander', rank: 'unit_commander' },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null, rank: u.rank as Rank };
}

async function currentActor(): Promise<Actor | null> {
  // TODO: local-dev escape hatch. Must never be set in production (P1 Task 6).
  if (process.env.AUTH_BYPASS === '1') return devActor();
  const session = await auth();
  if (!session?.appUserId) return null;
  const u = await db.user.findUnique({ where: { id: session.appUserId } });
  return u
    ? { id: u.id, name: u.name, email: u.email, role: u.role as Role | null, rank: u.rank as Rank }
    : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw Errors.unauthenticated();
  return actor;
}

export async function requirePageActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!actor.role) redirect('/role');
  return actor;
}
```

- [ ] **Step 8: Extend `prisma/seed.ts`**

Change the last line of `main()` so the seeded dev user starts with full command access, matching its existing `role: 'commander'`:

```ts
await db.user.create({
  data: { email: 'dev@maabara.local', name: 'משתמש פיתוח', role: 'commander', rank: 'unit_commander' },
});
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/lib/contracts.ts src/lib/labels.ts src/lib/errors.ts src/lib/session.ts
git commit -m "feat(command): add rank hierarchy data model and shared types"
```

---

### Task 2: `src/lib/command.ts` — authorization and subtree logic

The whole rule set from the spec, TDD, against the real test DB.

**Files:**
- Create: `src/lib/command.ts`
- Test: `tests/lib/command.test.ts`

**Interfaces:**
- Consumes (Task 1): `Rank`, `RANK_LEVEL`, `SubordinateStatusDTO`, `Role` from `@/lib/contracts`; `db` from `@/lib/db`; `Errors` from `@/lib/errors`; `statusLabel` from `@/lib/labels`; `resetDb` from `../helpers/db`.
- Produces: `hasCommanderPermission(rank: Rank): boolean`; `isAncestor(candidateAncestorId: number, userId: number): Promise<boolean>`; `assignSubordinate(actorId: number, subordinateId: number): Promise<void>`; `removeSubordinate(actorId: number, subordinateId: number): Promise<void>`; `setRank(actorId: number, targetId: number, newRank: Rank): Promise<void>`; `getSubtreeIds(rootId: number): Promise<number[]>`; `getSubordinateStatuses(actorId: number): Promise<SubordinateStatusDTO[]>`.

- [ ] **Step 1: Branch**

Already on `rbac/hierarchy` from Task 1 — no new branch needed; continue on it.

- [ ] **Step 2: Write the failing test** — `tests/lib/command.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  assignSubordinate, getSubordinateStatuses, getSubtreeIds, hasCommanderPermission,
  isAncestor, removeSubordinate, setRank,
} from '@/lib/command';
import type { Rank } from '@/lib/contracts';
import { resetDb } from '../helpers/db';

async function makeUser(email: string, rank: Rank, commanderId: number | null = null): Promise<number> {
  const u = await db.user.create({ data: { email, name: email, rank, commanderId } });
  return u.id;
}

describe('hasCommanderPermission', () => {
  it('is false only for soldier', () => {
    expect(hasCommanderPermission('soldier')).toBe(false);
    expect(hasCommanderPermission('ramad')).toBe(true);
    expect(hasCommanderPermission('raan')).toBe(true);
    expect(hasCommanderPermission('unit_commander')).toBe(true);
  });
});

describe('command hierarchy', () => {
  beforeEach(resetDb);

  it('a new user defaults to soldier', async () => {
    const u = await db.user.create({ data: { email: 'a@x.local', name: 'A' } });
    expect(u.rank).toBe('soldier');
    expect(u.commanderId).toBeNull();
  });

  describe('isAncestor', () => {
    it('finds a grandparent in the chain', async () => {
      const commander = await makeUser('c@x.local', 'unit_commander');
      const middle = await makeUser('m@x.local', 'raan', commander);
      const leaf = await makeUser('l@x.local', 'soldier', middle);
      expect(await isAncestor(commander, leaf)).toBe(true);
      expect(await isAncestor(middle, leaf)).toBe(true);
      expect(await isAncestor(leaf, commander)).toBe(false);
    });

    it('is false with no chain at all', async () => {
      const a = await makeUser('a@x.local', 'soldier');
      const b = await makeUser('b@x.local', 'soldier');
      expect(await isAncestor(a, b)).toBe(false);
    });
  });

  describe('assignSubordinate', () => {
    it('sets the direct link when the actor has commander permission', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier');
      await assignSubordinate(commander, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBe(commander);
    });

    it('rejects a soldier acting as commander', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      const target = await makeUser('t@x.local', 'soldier');
      await expect(assignSubordinate(soldier, target)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects self-assignment', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      await expect(assignSubordinate(commander, commander)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a cycle (assigning your own ancestor as your subordinate)', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const middle = await makeUser('mid@x.local', 'raan', top);
      await expect(assignSubordinate(middle, top)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    // Review Focus 3.
    it('reassigns a subordinate who already has a different commander', async () => {
      const commanderA = await makeUser('a@x.local', 'ramad');
      const commanderB = await makeUser('b@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commanderA);
      await assignSubordinate(commanderB, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBe(commanderB);
    });
  });

  describe('removeSubordinate', () => {
    it('removes a direct link', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commander);
      await removeSubordinate(commander, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBeNull();
    });

    // Review Focus 2.
    it('rejects removing a grandchild (not a direct report)', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const middle = await makeUser('mid@x.local', 'ramad', top);
      const leaf = await makeUser('leaf@x.local', 'soldier', middle);
      await expect(removeSubordinate(top, leaf)).rejects.toMatchObject({ code: 'VALIDATION' });
      expect((await db.user.findUniqueOrThrow({ where: { id: leaf } })).commanderId).toBe(middle);
    });
  });

  describe('setRank', () => {
    it('promotes a descendant to a strictly lower rank than the actor', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const soldier = await makeUser('s@x.local', 'soldier', top);
      await setRank(top, soldier, 'ramad');
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).rank).toBe('ramad');
    });

    it('rejects a soldier acting as commander', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      const target = await makeUser('t@x.local', 'soldier', soldier);
      await expect(setRank(soldier, target, 'ramad')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects a target outside the actor subtree', async () => {
      const commander = await makeUser('c@x.local', 'raan');
      const stranger = await makeUser('x@x.local', 'soldier');
      await expect(setRank(commander, stranger, 'ramad')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    // Review Focus 1.
    it('rejects promoting to the actor own exact rank', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const mid = await makeUser('m@x.local', 'ramad', top);
      await expect(setRank(top, mid, 'raan')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects promoting above the actor own rank', async () => {
      const top = await makeUser('top@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', top);
      await expect(setRank(top, soldier, 'unit_commander')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('cascades: demoting to soldier orphans that user own direct subordinates', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const middle = await makeUser('mid@x.local', 'raan', top);
      const leaf = await makeUser('leaf@x.local', 'soldier', middle);
      await setRank(top, middle, 'soldier');
      expect((await db.user.findUniqueOrThrow({ where: { id: middle } })).rank).toBe('soldier');
      expect((await db.user.findUniqueOrThrow({ where: { id: leaf } })).commanderId).toBeNull();
    });

    // Review Focus 4.
    it('demoting someone with no subordinates does not throw', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const ramad = await makeUser('r@x.local', 'ramad', top);
      await expect(setRank(top, ramad, 'soldier')).resolves.toBeUndefined();
    });
  });

  describe('getSubtreeIds', () => {
    it('is empty for a leaf with nobody assigned', async () => {
      const leaf = await makeUser('l@x.local', 'ramad');
      expect(await getSubtreeIds(leaf)).toEqual([]);
    });

    // Review Focus / decision #4: recursive visibility down the whole chain.
    it('is recursive: a raan sees their ramads own soldiers too', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const ramadA = await makeUser('ra@x.local', 'ramad', top);
      const ramadB = await makeUser('rb@x.local', 'ramad', top);
      const soldier1 = await makeUser('s1@x.local', 'soldier', ramadA);
      const soldier2 = await makeUser('s2@x.local', 'soldier', ramadB);
      const ids = await getSubtreeIds(top);
      expect(ids.sort((a, b) => a - b)).toEqual([ramadA, ramadB, soldier1, soldier2].sort((a, b) => a - b));
    });
  });

  describe('getSubordinateStatuses', () => {
    it('rejects a soldier actor', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      await expect(getSubordinateStatuses(soldier)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    // Review Focus 5.
    it('returns an empty array for a commander with nobody assigned yet', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      expect(await getSubordinateStatuses(commander)).toEqual([]);
    });

    it('reports rank, role and null activity for a subordinate with no events', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await db.user.create({
        data: { email: 's@x.local', name: 'חייל אחד', rank: 'soldier', commanderId: commander, role: 'packer' },
      });
      const [row] = await getSubordinateStatuses(commander);
      expect(row).toMatchObject({
        id: soldier.id, name: 'חייל אחד', email: 's@x.local', rank: 'soldier', role: 'packer',
        lastActivityAt: null, lastActivityLabel: null,
      });
    });

    it('reports the latest status event as last activity', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commander);
      await db.statusEvent.create({
        data: { entityType: 'room', entityId: 1, toStatus: 'done', actorId: soldier, at: new Date(2026, 8, 20) },
      });
      await db.statusEvent.create({
        data: { entityType: 'room', entityId: 1, toStatus: 'packing', actorId: soldier, at: new Date(2026, 8, 22) },
      });
      const [row] = await getSubordinateStatuses(commander);
      expect(row.lastActivityAt).toBe(new Date(2026, 8, 22).toISOString());
      expect(row.lastActivityLabel).toBeTruthy();
    });
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/lib/command.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/command'`.

- [ ] **Step 4: Write `src/lib/command.ts`**

```ts
import type { Rank, Role, SubordinateStatusDTO } from '@/lib/contracts';
import { RANK_LEVEL } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

export function hasCommanderPermission(rank: Rank): boolean {
  return rank !== 'soldier';
}

/** Walks commanderId upward from userId. True if candidateAncestorId is anywhere in that chain. */
export async function isAncestor(candidateAncestorId: number, userId: number): Promise<boolean> {
  let current = await db.user.findUnique({ where: { id: userId }, select: { commanderId: true } });
  while (current?.commanderId != null) {
    if (current.commanderId === candidateAncestorId) return true;
    current = await db.user.findUnique({ where: { id: current.commanderId }, select: { commanderId: true } });
  }
  return false;
}

/** Any commander self-assigns; overwrites a prior commander link if one exists. */
export async function assignSubordinate(actorId: number, subordinateId: number): Promise<void> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  if (subordinateId === actorId) throw Errors.validation('לא ניתן להיות הפקוד של עצמך');
  if (await isAncestor(subordinateId, actorId)) {
    throw Errors.validation('שיוך זה יוצר מעגל בשרשרת הפיקוד');
  }
  await db.user.update({ where: { id: subordinateId }, data: { commanderId: actorId } });
}

/** Only the direct commander may remove the link. */
export async function removeSubordinate(actorId: number, subordinateId: number): Promise<void> {
  const subordinate = await db.user.findUniqueOrThrow({ where: { id: subordinateId } });
  if (subordinate.commanderId !== actorId) throw Errors.validation('פקוד זה אינו משויך אליך ישירות');
  await db.user.update({ where: { id: subordinateId }, data: { commanderId: null } });
}

/**
 * A commander may set the rank of anyone in their own subtree, to any rank
 * strictly below their own. Demoting to soldier orphans that user's own
 * direct subordinates (they are not reassigned up the chain).
 */
export async function setRank(actorId: number, targetId: number, newRank: Rank): Promise<void> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');
  if (!(await isAncestor(actorId, targetId))) throw Errors.validation('משתמש זה אינו בשרשרת הפיקוד שלך');
  if (RANK_LEVEL[newRank] >= RANK_LEVEL[actor.rank as Rank]) {
    throw Errors.validation('לא ניתן להעניק דרגה השווה או גבוהה משלך');
  }
  await db.user.update({ where: { id: targetId }, data: { rank: newRank } });
  if (newRank === 'soldier') {
    await db.user.updateMany({ where: { commanderId: targetId }, data: { commanderId: null } });
  }
}

/** Every descendant of rootId, breadth-first. Excludes rootId itself. */
export async function getSubtreeIds(rootId: number): Promise<number[]> {
  const ids: number[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db.user.findMany({
      where: { commanderId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

/** The commander tab's data: every descendant, with their latest activity if any. */
export async function getSubordinateStatuses(actorId: number): Promise<SubordinateStatusDTO[]> {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!hasCommanderPermission(actor.rank as Rank)) throw Errors.forbidden('אין הרשאת מפקד');

  const subtreeIds = await getSubtreeIds(actorId);
  if (subtreeIds.length === 0) return [];

  const [users, events] = await Promise.all([
    db.user.findMany({ where: { id: { in: subtreeIds } } }),
    db.statusEvent.findMany({
      where: { actorId: { in: subtreeIds } },
      orderBy: { at: 'desc' },
      select: { actorId: true, at: true, toStatus: true, entityType: true },
    }),
  ]);

  // Ordered newest first, so the first row seen for a user is their latest event.
  const latest = new Map<number, { at: Date; label: string }>();
  for (const e of events) {
    if (!latest.has(e.actorId)) {
      latest.set(e.actorId, { at: e.at, label: statusLabel(e.entityType, e.toStatus) });
    }
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    rank: u.rank as Rank,
    role: u.role as Role | null,
    lastActivityAt: latest.get(u.id)?.at.toISOString() ?? null,
    lastActivityLabel: latest.get(u.id)?.label ?? null,
  }));
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/lib/command.test.ts
```

Expected: PASS, all 20.

- [ ] **Step 6: Commit**

```bash
git add src/lib/command.ts tests/lib/command.test.ts
git commit -m "feat(command): rank hierarchy authorization and subtree logic"
```

---

### Task 3: API routes, schemas, and the typed client

Thin wrappers over Task 2's already-tested logic. Verified by build + a manual smoke pass, matching this repo's existing convention (no dedicated route-level test files anywhere in the tree).

**Files:**
- Create: `src/app/api/command/subordinates/route.ts`
- Create: `src/app/api/command/subordinates/[id]/route.ts`
- Create: `src/app/api/command/rank/route.ts`
- Create: `src/app/api/command/subtree/route.ts`
- Modify: `src/lib/api/schemas.ts`
- Modify: `src/lib/api/client.ts`

**Interfaces:**
- Consumes (Task 2): `assignSubordinate`, `removeSubordinate`, `setRank`, `getSubordinateStatuses` from `@/lib/command`. Consumes (Task 1): `Rank`, `RANKS`, `SubordinateStatusDTO` from `@/lib/contracts`. Consumes (existing): `handle` from `@/lib/api/respond`; `requireActor` from `@/lib/session`; `idParamSchema`, `oneOf` from `@/lib/api/schemas`.
- Produces: `POST /api/command/subordinates`, `DELETE /api/command/subordinates/:id`, `PATCH /api/command/rank`, `GET /api/command/subtree`; `api.assignSubordinate`, `api.removeSubordinate`, `api.setRank`, `api.subtree` on the typed client.

- [ ] **Step 1: Add schemas** — append to `src/lib/api/schemas.ts`

Add `RANKS` to the existing `@/lib/contracts` import line, then append:

```ts
import { BOX_CODE_RE, PACKING_UNIT_STATUSES, PACKING_UNIT_TYPES, RANKS, TRANSPORT_STATUSES, TRANSPORT_TYPES } from '@/lib/contracts';

export const rankSchema = oneOf(RANKS, 'דרגה לא חוקית');

export const assignSubordinateSchema = z.object({ subordinateId: idParamSchema });
export const setRankSchema = z.object({ userId: idParamSchema, rank: rankSchema });
```

- [ ] **Step 2: `src/app/api/command/subordinates/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { assignSubordinateSchema } from '@/lib/api/schemas';
import { assignSubordinate } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { subordinateId } = assignSubordinateSchema.parse(await req.json());
    await assignSubordinate(actor.id, subordinateId);
    return { ok: true };
  });
}
```

- [ ] **Step 3: `src/app/api/command/subordinates/[id]/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/api/schemas';
import { removeSubordinate } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await removeSubordinate(actor.id, idParamSchema.parse(id));
    return { ok: true };
  });
}
```

- [ ] **Step 4: `src/app/api/command/rank/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { setRankSchema } from '@/lib/api/schemas';
import { setRank } from '@/lib/command';
import { requireActor } from '@/lib/session';

export async function PATCH(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { userId, rank } = setRankSchema.parse(await req.json());
    await setRank(actor.id, userId, rank);
    return { ok: true };
  });
}
```

- [ ] **Step 5: `src/app/api/command/subtree/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { getSubordinateStatuses } from '@/lib/command';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const actor = await requireActor();
    return getSubordinateStatuses(actor.id);
  });
}
```

- [ ] **Step 6: Extend `src/lib/api/client.ts`**

`call()` currently only accepts `'GET' | 'POST' | 'PUT'`; widen it to include `'PATCH'` and `'DELETE'`, add the new imports, and add the four methods:

```ts
import type {
  ApiError, AssignSubordinateReq, ClosePackingUnitReq, ClosePackingUnitResult, CreateTransportReq,
  DashboardDTO, DistributeReq, ErrorCode, GroupDTO, LoadReq, MeDTO, OpenPackingUnitReq, PackableItemDTO,
  PackingUnitDTO, PackingUnitStatus, PackingUnitSummaryDTO, Rank, ReceiveReq, ReceiveResult, Role,
  RoomDTO, SetItemsReq, SetRankReq, SubordinateStatusDTO, TimelineEventDTO, TransportStatus, TransportUnitDTO,
} from '@/lib/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly messageHe: string,
    public readonly status: number,
  ) {
    super(messageHe);
  }
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const fallback: ApiError = { error: 'INTERNAL', messageHe: 'אין תקשורת עם השרת' };
  const data: unknown = await res.json().catch(() => fallback);
  if (!res.ok) {
    const err = data as ApiError;
    throw new ApiClientError(err.error, err.messageHe, res.status);
  }
  return data as T;
}
```

Add to the `api` object, after `dashboard`:

```ts
  assignSubordinate: (req: AssignSubordinateReq) => call<{ ok: true }>('POST', '/api/command/subordinates', req),
  removeSubordinate: (id: number) => call<{ ok: true }>('DELETE', `/api/command/subordinates/${id}`),
  setRank: (req: SetRankReq) => call<{ ok: true }>('PATCH', '/api/command/rank', req),
  subtree: () => call<SubordinateStatusDTO[]>('GET', '/api/command/subtree'),
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: build succeeds, no type errors.

- [ ] **Step 8: Smoke the routes**

With `AUTH_BYPASS=1` in `.env` (dev actor is now seeded/upserted as `unit_commander`):

```bash
npm run dev
```

```bash
curl -s http://localhost:3000/api/command/subtree
```

Expected: `[]` (the dev actor has no subordinates yet).

```bash
curl -s -X POST http://localhost:3000/api/command/subordinates -H 'Content-Type: application/json' -d '{"subordinateId": 999}'
```

Expected: `{"error":"NOT_FOUND", ...}` or a Prisma not-found error surfacing as `INTERNAL` — either way, a JSON error body, not a crash. (There is no user id 999 yet; this just proves the route wires through to `assignSubordinate` and `handle()` catches it.)

- [ ] **Step 9: Commit**

```bash
git add src/app/api/command src/lib/api/schemas.ts src/lib/api/client.ts
git commit -m "feat(command): rank hierarchy API routes and client methods"
```

---

### Task 4: `/command/team` — the commander's team view

New page, gated by `hasCommanderPermission`, built from the existing UI kit. No automated UI tests — none exist anywhere else in this repo either (Global Constraints); verified by a manual dev-server pass.

**Files:**
- Create: `src/app/command/team/page.tsx`
- Create: `src/app/command/team/TeamView.tsx`

**Interfaces:**
- Consumes (Task 1–3): `hasCommanderPermission` from `@/lib/command`; `requirePageActor` from `@/lib/session`; `api.subtree`, `api.assignSubordinate`, `api.removeSubordinate`, `api.setRank` from `@/lib/api/client`; `RANKS`, `RANK_LEVEL`, `Rank`, `SubordinateStatusDTO` from `@/lib/contracts`; `RANK_LABELS`, `ROLE_LABELS` from `@/lib/labels`. Consumes (existing UI kit): `Banner`, `Button`, `Card`, `EmptyState`, `OptionList`, `TextField`, `useAction` from `@/components/ui`.

- [ ] **Step 1: `src/app/command/team/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { hasCommanderPermission } from '@/lib/command';
import { requirePageActor } from '@/lib/session';
import { TeamView } from './TeamView';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const actor = await requirePageActor();
  if (!hasCommanderPermission(actor.rank)) redirect('/field');
  return <TeamView actorRank={actor.rank} />;
}
```

- [ ] **Step 2: `src/app/command/team/TeamView.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Banner, Button, Card, EmptyState, OptionList, TextField, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';
import { RANKS, RANK_LEVEL, type Rank, type SubordinateStatusDTO } from '@/lib/contracts';
import { RANK_LABELS, ROLE_LABELS } from '@/lib/labels';

export function TeamView({ actorRank }: { actorRank: Rank }) {
  const [subordinates, setSubordinates] = useState<SubordinateStatusDTO[] | null>(null);
  const [newSubordinateId, setNewSubordinateId] = useState('');
  const { busy, error, run } = useAction();

  function load() {
    void run(() => api.subtree(), setSubordinates);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promotableRanks = RANKS.filter((r) => RANK_LEVEL[r] < RANK_LEVEL[actorRank]);

  function assign() {
    const subordinateId = Number(newSubordinateId);
    if (!Number.isInteger(subordinateId) || subordinateId <= 0) return;
    void run(
      () => api.assignSubordinate({ subordinateId }),
      () => {
        setNewSubordinateId('');
        load();
      },
    );
  }

  function remove(id: number) {
    void run(() => api.removeSubordinate(id), load);
  }

  function promote(userId: number, rank: Rank) {
    void run(() => api.setRank({ userId, rank }), load);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">הצוות שלי</h1>

      <Card>
        <p className="mb-2 font-bold">שיוך פקוד</p>
        {/* TODO: numeric id entry until a user-directory search endpoint exists. */}
        <TextField label="מזהה משתמש" value={newSubordinateId} onChange={setNewSubordinateId} inputMode="numeric" />
        <div className="mt-2">
          <Button onClick={assign} busy={busy} disabled={!newSubordinateId}>
            שייך
          </Button>
        </div>
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {subordinates !== null && subordinates.length === 0 && (
        <EmptyState title="אין פקודים עדיין" body="שייכו פקוד ראשון כדי לראות אותו כאן" />
      )}

      {subordinates !== null && subordinates.length > 0 && (
        <div className="flex flex-col gap-3">
          {subordinates.map((s) => (
            <Card key={s.id}>
              <p className="font-bold">{s.name}</p>
              <p className="text-sm text-ink-muted">
                {RANK_LABELS[s.rank]}
                {s.role && ` · ${ROLE_LABELS[s.role]}`}
              </p>
              <p className="text-sm text-ink-muted">{s.lastActivityLabel ?? 'אין פעילות עדיין'}</p>
              <div className="mt-2 flex flex-col gap-2">
                {promotableRanks.length > 0 && (
                  <OptionList
                    options={promotableRanks.map((r) => ({ value: r, label: RANK_LABELS[r] }))}
                    value={s.rank}
                    onChange={(r) => promote(s.id, r)}
                  />
                )}
                <Button variant="quiet" size="md" onClick={() => remove(s.id)} busy={busy}>
                  הסר משיוך ישיר
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds, no type errors.

- [ ] **Step 4: Manual smoke pass**

With `AUTH_BYPASS=1` (dev actor is `unit_commander`):

```bash
npm run dev
```

Open `http://localhost:3000/command/team`. Expected: page renders, shows "אין פקודים עדיין" (empty state), the assign-by-id form works after you note a real user id from `npm run db:studio` or a seeded row, and the promoted/removed rows refresh in place.

- [ ] **Step 5: Commit**

```bash
git add src/app/command/team
git commit -m "feat(command): team view for the rank hierarchy"
```
