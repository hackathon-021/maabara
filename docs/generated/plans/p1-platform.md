# P1 — Platform & Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the team a running Next.js + Prisma app with frozen contracts, realistic seed data, shared test helpers, read-only lookups, Google sign-in with a free role picker, and a deployed HTTPS URL.

**Architecture:** You own everything shared. Tasks 1–3 must be on `main` within ~1 hour (Checkpoint A) — the other four people are blocked until then, so do them first and fast. Afterwards: lookups, auth, deploy, and you are the integration captain.

**Tech Stack:** Next.js 15, TypeScript, Tailwind v4, Prisma 6, PostgreSQL 16, Auth.js v5 (`next-auth@beta`), zod, Vitest 3, tsx, dotenv-cli.

**Spec:** `docs/generated/2026-09-22-mvp-design.md`. **Master plan (contracts you copy verbatim):** `docs/generated/plan.md` §5.

## Global Constraints

See `docs/generated/plan.md` → Global Constraints. In particular: files in plan.md §5 are copied **verbatim**; `AUTH_BYPASS` must never be set in production.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: all create-next-app files at repo root, `vitest.config.ts`, `tests/setup.ts`, `.env.example`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `npm run dev|build|test|db:migrate|db:test:migrate|demo:reset`; path alias `@/*` → `src/*`.

- [ ] **Step 1: Branch and generate the app in a sibling folder** (the repo already has files, so create-next-app can't run in place)

Run this from the repository root, wherever you cloned it — the script never hard-codes a path:

```bash
git checkout main && git pull && git checkout -b p1/scaffold
REPO="$PWD"
cd "$(dirname "$REPO")"
npx create-next-app@15 maabara-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
rm -rf maabara-scaffold/.git maabara-scaffold/README.md
cp -r maabara-scaffold/. "$REPO"/
rm -rf maabara-scaffold
cd "$REPO"
```

- [ ] **Step 2: Install dependencies**

```bash
npm i @prisma/client@6 next-auth@beta zod swr qrcode.react html5-qrcode
npm i -D prisma@6 vitest@3 vite-tsconfig-paths tsx dotenv dotenv-cli
```

- [ ] **Step 3: Add scripts and seed config to `package.json`** (merge into the existing `scripts`; keep `dev`, `start`, `lint`)

```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "postinstall": "prisma generate",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:test:migrate": "dotenv -e .env.test -- prisma migrate deploy",
    "demo:reset": "prisma db seed"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Tests share one database and truncate it — never run files in parallel.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

- [ ] **Step 5: Create `tests/setup.ts`**

```ts
import { config } from 'dotenv';

// .env.test wins; tests must never touch the dev database.
config({ path: '.env.test', override: true });
if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('Refusing to run tests: DATABASE_URL in .env.test must point at a *test* database');
}
```

- [ ] **Step 6: Create `.env.example` and allow it in git**

```bash
# .env.example — copy to .env (dev) and fill in
DATABASE_URL=postgresql://postgres:pg@localhost:5432/maabara_dev
# Generate with: npx auth secret
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# Local dev only: skip Google and act as dev@maabara.local. NEVER set in production.
AUTH_BYPASS=1

# .env.test (separate file, not committed) contains only:
# DATABASE_URL=postgresql://postgres:pg@localhost:5432/maabara_test
```

Append to `.gitignore`:

```
!.env.example
```

- [ ] **Step 7: Start local Postgres and create both databases**

```bash
docker run -d --name maabara-pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
docker exec maabara-pg psql -U postgres -c "create database maabara_dev" -c "create database maabara_test"
cp .env.example .env
printf 'DATABASE_URL=postgresql://postgres:pg@localhost:5432/maabara_test\n' > .env.test
```

(No Docker? Create two Neon databases named `maabara_dev` and `maabara_test` and put their URLs in `.env` / `.env.test`. The test URL must contain the word `test`.)

- [ ] **Step 8: Verify the scaffold builds**

Run: `npx next build`
Expected: "Compiled successfully". (`npm run build` needs the Prisma schema from Task 2.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and env setup"
```

---

### Task 2: Frozen contracts, Prisma schema, DB client, session stub

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/contracts.ts`, `src/lib/labels.ts`, `src/lib/errors.ts`, `src/lib/api/respond.ts`, `src/lib/api/client.ts`, `src/lib/session.ts`
- Test: `tests/lib/respond.test.ts`, `tests/lib/labels.test.ts`

**Interfaces:**
- Produces: everything in plan.md §5; `db: PrismaClient`, `type Tx = Prisma.TransactionClient`, `TRUNCATE_ALL_SQL: string`; `requireActor()`, `requirePageActor()` (stubbed: always the dev user); `devActor()`.

- [ ] **Step 1: Copy the frozen files verbatim** from `docs/generated/plan.md`:
  - §5.1 → `src/lib/contracts.ts`
  - §5.2 → `src/lib/labels.ts`
  - §5.3 → `src/lib/errors.ts`
  - §5.4 → `src/lib/api/respond.ts`
  - §5.5 → `src/lib/api/client.ts`
  - §5.7 → `prisma/schema.prisma`

- [ ] **Step 2: Create `src/lib/db.ts`**

```ts
import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client across Next.js hot reloads.
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

/** Wipes every table. Used by the seed (demo reset) and by tests. */
export const TRUNCATE_ALL_SQL = `TRUNCATE status_events, notifications, packing_unit_items, packing_units,
  transport_units, mapping_reports, rooms, sub_categories, categories, locations, groups, users
  RESTART IDENTITY CASCADE`;
```

- [ ] **Step 3: Create the stub `src/lib/session.ts`**

```ts
import type { Role } from '@/lib/contracts';
import { db } from '@/lib/db';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
}

export const DEV_EMAIL = 'dev@maabara.local';

export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander' },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}

// TODO(P1 Task 5): replace with the Auth.js session. Until then every request is the dev user.
export async function requireActor(): Promise<Actor> {
  return devActor();
}

export async function requirePageActor(): Promise<Actor> {
  return devActor();
}
```

- [ ] **Step 4: Create and apply the first migration on both databases**

```bash
npx prisma migrate dev --name init
npm run db:test:migrate
```

Expected: `Your database is now in sync with your schema.` (dev) and `All migrations have been successfully applied.` (test).

- [ ] **Step 5: Write the tests** — `tests/lib/respond.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { Errors } from '@/lib/errors';

describe('handle', () => {
  it('returns JSON 200 on success', async () => {
    const res = await handle(async () => ({ ok: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('maps AppError to its status and the standard body', async () => {
    const res = await handle(async () => {
      throw Errors.roomNotMapped();
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'ROOM_NOT_MAPPED', messageHe: 'יש לסיים את המיפוי' });
  });

  it('maps ZodError to 400 VALIDATION', async () => {
    const res = await handle(async () => z.object({ a: z.number() }).parse({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION');
  });

  it('maps unknown errors to 500 INTERNAL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('INTERNAL');
  });
});
```

`tests/lib/labels.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { statusLabel } from '@/lib/labels';

describe('statusLabel', () => {
  it('resolves by entity type', () => {
    expect(statusLabel('packing_unit', 'in_transit')).toBe('אריזה בדרך');
    expect(statusLabel('transport_unit', 'in_transit')).toBe('יחידת הובלה בדרך');
  });
  it('knows the unloaded pseudo-status', () => {
    expect(statusLabel('transport_unit', 'unloaded')).toBe('יחידת הובלה נפרקה במלואה');
  });
  it('falls back to the raw value and handles null', () => {
    expect(statusLabel('room', 'weird')).toBe('weird');
    expect(statusLabel('room', null)).toBe('—');
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS (7 tests). These guard the verbatim copy — a failure means Step 1 wasn't copied exactly.

- [ ] **Step 7: Verify the production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: frozen contracts, Prisma schema, DB client, session stub"
```

---

### Task 3: Seed data + shared test fixture → Checkpoint A

**Files:**
- Create: `prisma/seed.ts`, `tests/helpers/db.ts`
- Test: `tests/lib/fixture.test.ts`

**Interfaces:**
- Consumes: `db`, `TRUNCATE_ALL_SQL` (Task 2).
- Produces: `resetDb(): Promise<void>`, `seedFixture(): Promise<Fixture>` (shape in plan.md §6); `npm run demo:reset`.

- [ ] **Step 1: Write the failing test** — `tests/lib/fixture.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { resetDb, seedFixture } from '../helpers/db';

describe('seedFixture', () => {
  beforeEach(resetDb);

  it('creates the documented rooms and reports', async () => {
    const fx = await seedFixture();
    const roomA = await db.room.findUniqueOrThrow({ where: { id: fx.roomA }, include: { mappingReports: true } });
    expect(roomA.status).toBe('done');
    expect(roomA.mappingReports.map((r) => `${r.status}:${r.quantity}`).sort()).toEqual(['salvage:1', 'transfer:2']);
    const printer = await db.mappingReport.findUniqueOrThrow({ where: { id: fx.reports.printer } });
    expect(printer.status).toBe('disposal');
    expect(printer.roomId).toBe(fx.roomB);
    const unmapped = await db.room.findUniqueOrThrow({ where: { id: fx.roomUnmapped } });
    expect(unmapped.status).toBe('waiting');
  });

  it('resetDb empties everything', async () => {
    await seedFixture();
    await resetDb();
    expect(await db.room.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/fixture.test.ts`
Expected: FAIL — `Cannot find module '../helpers/db'`.

- [ ] **Step 3: Implement `tests/helpers/db.ts`**

```ts
import { db, TRUNCATE_ALL_SQL } from '@/lib/db';

export interface Fixture {
  userId: number;
  groupId: number;
  /** status 'done'; laptop x2 (transfer), monitor x1 (salvage); no disposal */
  roomA: number;
  /** status 'done'; chair x1 (transfer), old printer x1 (disposal) */
  roomB: number;
  /** status 'waiting' (not mapped) */
  roomUnmapped: number;
  reports: { laptop: number; monitor: number; chair: number; printer: number };
}

export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(TRUNCATE_ALL_SQL);
}

export async function seedFixture(): Promise<Fixture> {
  const user = await db.user.create({ data: { email: 'tester@maabara.local', name: 'בודק', role: 'packer' } });
  const group = await db.group.create({ data: { name: 'מדור בדיקות' } });
  const cat = await db.category.create({ data: { description: 'כללי' } });
  const sub = async (description: string) =>
    (await db.subCategory.create({ data: { categoryId: cat.id, description } })).id;
  const laptopSub = await sub('מחשב נייד');
  const monitorSub = await sub('מסך');
  const chairSub = await sub('כיסא');
  const printerSub = await sub('מדפסת');

  const room = (description: string, status: string) =>
    db.room.create({ data: { groupId: group.id, description, status, roomManager: 'אחראי חדר' } });
  const roomA = await room('חדר A', 'done');
  const roomB = await room('חדר B', 'done');
  const roomUnmapped = await room('חדר לא ממופה', 'waiting');

  const report = async (roomId: number, subCategoryId: number, status: string, quantity: number) =>
    (await db.mappingReport.create({ data: { roomId, subCategoryId, status, quantity, reportedBy: '1234567' } })).id;

  return {
    userId: user.id,
    groupId: group.id,
    roomA: roomA.id,
    roomB: roomB.id,
    roomUnmapped: roomUnmapped.id,
    reports: {
      laptop: await report(roomA.id, laptopSub, 'transfer', 2),
      monitor: await report(roomA.id, monitorSub, 'salvage', 1),
      chair: await report(roomB.id, chairSub, 'transfer', 1),
      printer: await report(roomB.id, printerSub, 'disposal', 1),
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/fixture.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the demo seed** — `prisma/seed.ts`

```ts
import { PrismaClient } from '@prisma/client';
import { TRUNCATE_ALL_SQL } from '../src/lib/db';

// Demo reset: wipes everything and loads the demo world. Safe to run between rehearsals.
const db = new PrismaClient();

async function main() {
  await db.$executeRawUnsafe(TRUNCATE_ALL_SQL);

  const tikshuv = await db.group.create({ data: { name: 'ענף תקשוב — מדור מערכות' } });
  const logistics = await db.group.create({ data: { name: 'ענף לוגיסטיקה — מדור אחזקה' } });
  const building = await db.location.create({ data: { name: 'בניין 12 (בסיס מקור)' } });

  const subs: Record<string, number> = {};
  const categories: Record<string, string[]> = {
    'מחשוב': ['מחשב נייד', 'מסך', 'מקלדת', 'נתב'],
    'ריהוט': ['כיסא', 'שולחן'],
    'ציוד משרדי': ['מדפסת', 'טלפון שולחני'],
    'ציוד רגיש': ['כספת', 'מכשיר קשר'],
  };
  for (const [category, names] of Object.entries(categories)) {
    const cat = await db.category.create({ data: { description: category } });
    for (const name of names) {
      subs[name] = (await db.subCategory.create({ data: { categoryId: cat.id, description: name } })).id;
    }
  }

  const room = (groupId: number, description: string, status: string, roomManager: string) =>
    db.room.create({ data: { groupId, locationId: building.id, description, status, roomManager } });
  const r101 = await room(tikshuv.id, 'חדר 101', 'done', 'רס"ל דנה כהן');
  const r102 = await room(tikshuv.id, 'חדר 102', 'done', 'סמ"ר יואב לוי');
  await room(tikshuv.id, 'חדר 103', 'waiting', 'סמל נועה פרץ');
  const r201 = await room(logistics.id, 'חדר 201', 'done', 'רס"ב אבי מזרחי');

  const report = (roomId: number, sub: string, status: string, quantity: number, serial?: string, description?: string) =>
    db.mappingReport.create({
      data: { roomId, subCategoryId: subs[sub], status, quantity, serial, description, reportedBy: '7654321' },
    });

  // Room 101: the main demo room — two boxes empty it and it becomes 'closed'.
  await report(r101.id, 'מחשב נייד', 'transfer', 2, 'LT-4471');
  await report(r101.id, 'מסך', 'transfer', 2);
  await report(r101.id, 'טלפון שולחני', 'salvage', 1);
  // Room 102: has a disposal item → becomes 'awaiting_disposal' when fully packed.
  await report(r102.id, 'כיסא', 'transfer', 4);
  await report(r102.id, 'שולחן', 'transfer', 1);
  await report(r102.id, 'מדפסת', 'disposal', 1, undefined, 'מדפסת ישנה לגריטה');
  // Room 201: sensitive equipment.
  await report(r201.id, 'מכשיר קשר', 'transfer', 3, 'MK-2231');
  await report(r201.id, 'כספת', 'transfer', 1, 'SF-09');

  await db.user.create({ data: { email: 'dev@maabara.local', name: 'משתמש פיתוח', role: 'commander' } });
}

main()
  .then(() => console.log('Demo data loaded'))
  .finally(() => db.$disconnect());
```

- [ ] **Step 6: Run the seed**

Run: `npm run demo:reset`
Expected: `Demo data loaded`. Check with `npx prisma studio` that "חדר 101" has 3 mapping reports.

- [ ] **Step 7: Run all tests, commit, merge, announce Checkpoint A**

```bash
npm test
git add -A
git commit -m "feat: demo seed and shared test fixture"
git checkout main && git pull && git merge --ff-only p1/scaffold && git push
```

Post in team chat: "Checkpoint A on main. Pull, `npm i`, create `.env` + `.env.test` from `.env.example` (see P1 Task 1 Step 7), then `npm run db:migrate && npm run db:test:migrate && npm run demo:reset && npm test`."

---

### Task 4: Lookup endpoints (groups, rooms)

**Files:**
- Create: `src/lib/lookups.ts`, `src/app/api/groups/route.ts`, `src/app/api/rooms/route.ts`
- Test: `tests/lib/lookups.test.ts`

**Interfaces:**
- Consumes: `db`, `handle`, `requireActor`.
- Produces: `listGroups(): Promise<GroupDTO[]>`, `listRooms(groupId: number): Promise<RoomDTO[]>`; `GET /api/groups`, `GET /api/rooms?groupId=`.

- [ ] **Step 1: Branch and write the failing test**

```bash
git checkout -b p1/lookups
```

`tests/lib/lookups.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listGroups, listRooms } from '@/lib/lookups';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('lookups', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('lists available groups', async () => {
    await db.group.create({ data: { name: 'מדור מחוק', isAvailable: false } });
    expect(await listGroups()).toEqual([{ id: fx.groupId, name: 'מדור בדיקות' }]);
  });

  it('lists available rooms of one group, sorted by description', async () => {
    await db.room.update({ where: { id: fx.roomB }, data: { isAvailable: false } });
    const rooms = await listRooms(fx.groupId);
    expect(rooms.map((r) => r.description)).toEqual(['חדר A', 'חדר לא ממופה']);
    expect(rooms[0]).toEqual({
      id: fx.roomA, groupId: fx.groupId, description: 'חדר A', status: 'done', roomManager: 'אחראי חדר',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/lookups.test.ts`
Expected: FAIL — cannot find `@/lib/lookups`.

- [ ] **Step 3: Implement `src/lib/lookups.ts`**

```ts
import type { GroupDTO, RoomDTO, RoomStatus } from '@/lib/contracts';
import { db } from '@/lib/db';

export async function listGroups(): Promise<GroupDTO[]> {
  return db.group.findMany({
    where: { isAvailable: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

export async function listRooms(groupId: number): Promise<RoomDTO[]> {
  const rooms = await db.room.findMany({
    where: { groupId, isAvailable: true },
    orderBy: { description: 'asc' },
  });
  return rooms.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    description: r.description,
    status: r.status as RoomStatus,
    roomManager: r.roomManager,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/lookups.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the routes**

`src/app/api/groups/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import { listGroups } from '@/lib/lookups';
import { requireActor } from '@/lib/session';

export async function GET() {
  return handle(async () => {
    await requireActor();
    return listGroups();
  });
}
```

`src/app/api/rooms/route.ts`

```ts
import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { listRooms } from '@/lib/lookups';
import { requireActor } from '@/lib/session';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const groupId = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('groupId'));
    return listRooms(groupId);
  });
}
```

- [ ] **Step 6: Smoke-test manually**

Run `npm run dev`, then `curl "http://localhost:3000/api/rooms?groupId=1"`
Expected: JSON array containing `"חדר 101"`. `curl "http://localhost:3000/api/rooms"` → HTTP 400 `{"error":"VALIDATION",...}`.

- [ ] **Step 7: Commit and merge**

```bash
npm test && npm run build
git add -A && git commit -m "feat: groups and rooms lookup endpoints"
git checkout main && git pull && git merge --ff-only p1/lookups && git push
```

---

### Task 5: Google sign-in, role picker, role switcher

**Files:**
- Create: `src/auth.ts`, `src/types/next-auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/users.ts`, `src/app/api/me/route.ts`, `src/app/api/me/role/route.ts`, `src/app/login/page.tsx`, `src/app/role/page.tsx`, `src/components/RoleSwitcher.tsx`
- Modify: `src/lib/session.ts` (replace whole file), `src/app/page.tsx` (replace scaffold page)
- Test: `tests/lib/users.test.ts`

**Interfaces:**
- Consumes: `db`, `Errors`, `ROLES`, `ROLE_LABELS`, `api.setRole`.
- Produces: `ensureUser(email, name): Promise<User>`, `setUserRole(userId, role): Promise<MeDTO>`, `toMeDTO(user)`; real `requireActor()` / `requirePageActor()`; `<RoleSwitcher role={Role | null} />` (P3 uses it in the field header, P5 in the command header).

- [ ] **Step 1: Create the Google OAuth client** (Google Cloud Console → APIs & Services)
  - OAuth consent screen: External, app name "המעברה", scopes `openid`, `email`, `profile` → **Publish app** (these scopes need no verification, so any Google account — e.g. judges' — can sign in).
  - Credentials → Create OAuth client ID → Web application. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (production one added in Task 6).
  - Put ID/secret into `.env` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; run `npx auth secret` for `AUTH_SECRET`. Share all three with the team privately (not in git).

- [ ] **Step 2: Branch and write the failing test** — `tests/lib/users.test.ts`

```bash
git checkout -b p1/auth
```

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ensureUser, setUserRole } from '@/lib/users';
import { resetDb } from '../helpers/db';

describe('users', () => {
  beforeEach(resetDb);

  it('ensureUser is idempotent per email and starts without a role', async () => {
    const a = await ensureUser('a@gmail.com', 'A');
    const b = await ensureUser('a@gmail.com', 'A again');
    expect(b.id).toBe(a.id);
    expect(a.role).toBeNull();
    expect(await db.user.count()).toBe(1);
  });

  it('setUserRole sets a valid role', async () => {
    const u = await ensureUser('a@gmail.com', 'A');
    expect(await setUserRole(u.id, 'unloader')).toEqual({ id: u.id, email: 'a@gmail.com', name: 'A', role: 'unloader' });
  });

  it('setUserRole rejects an unknown role', async () => {
    const u = await ensureUser('a@gmail.com', 'A');
    await expect(setUserRole(u.id, 'admin')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/lib/users.test.ts`
Expected: FAIL — cannot find `@/lib/users`.

- [ ] **Step 4: Implement `src/lib/users.ts`**

```ts
import type { User } from '@prisma/client';
import { ROLES, type MeDTO, type Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export function toMeDTO(u: User): MeDTO {
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role | null };
}

export async function ensureUser(email: string, name: string): Promise<User> {
  return db.user.upsert({ where: { email }, update: {}, create: { email, name } });
}

export async function setUserRole(userId: number, role: string): Promise<MeDTO> {
  if (!(ROLES as readonly string[]).includes(role)) throw Errors.validation('תפקיד לא חוקי');
  return toMeDTO(await db.user.update({ where: { id: userId }, data: { role } }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/users.test.ts`
Expected: PASS.

- [ ] **Step 6: Configure Auth.js**

`src/auth.ts`

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { ensureUser } from '@/lib/users';

// JWT sessions: the token only carries our users.id. Role is read fresh from the DB on every
// request, so switching roles takes effect immediately without re-login.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token }) {
      if (token.email && token.userId === undefined) {
        const user = await ensureUser(token.email, token.name ?? token.email);
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.userId = token.userId;
      return session;
    },
  },
});
```

`src/types/next-auth.d.ts`

```ts
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    userId?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number;
  }
}
```

(If the `next-auth/jwt` augmentation doesn't type-check with the installed beta, replace `token.userId` reads with `(token as { userId?: number }).userId` and leave a `// TODO:`.)

`src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Replace `src/lib/session.ts` entirely**

```ts
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Role } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
}

export const DEV_EMAIL = 'dev@maabara.local';

export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander' },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}

async function currentActor(): Promise<Actor | null> {
  // TODO: local-dev escape hatch. Must never be set in production (Task 6).
  if (process.env.AUTH_BYPASS === '1') return devActor();
  const session = await auth();
  if (!session?.userId) return null;
  const u = await db.user.findUnique({ where: { id: session.userId } });
  return u ? { id: u.id, name: u.name, email: u.email, role: u.role as Role | null } : null;
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

- [ ] **Step 8: `/api/me` routes**

`src/app/api/me/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import type { MeDTO } from '@/lib/contracts';
import { requireActor } from '@/lib/session';

export async function GET() {
  return handle(async (): Promise<MeDTO> => {
    const { id, email, name, role } = await requireActor();
    return { id, email, name, role };
  });
}
```

`src/app/api/me/role/route.ts`

```ts
import { z } from 'zod';
import { handle } from '@/lib/api/respond';
import { requireActor } from '@/lib/session';
import { setUserRole } from '@/lib/users';

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { role } = z.object({ role: z.string() }).parse(await req.json());
    return setUserRole(actor.id, role);
  });
}
```

- [ ] **Step 9: Pages — root redirect, login, role picker**

`src/app/page.tsx` (replaces the scaffold page)

```tsx
import { redirect } from 'next/navigation';
import { requirePageActor } from '@/lib/session';

export default async function Home() {
  const actor = await requirePageActor();
  redirect(actor.role === 'commander' ? '/command' : '/field');
}
```

`src/app/login/page.tsx`

```tsx
import { signIn } from '@/auth';

// TODO: swap the raw button for P3's <Button> once src/components/ui lands.
export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-[#665FB3]">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold mb-2">המעברה</h1>
        <p className="text-gray-600 mb-8">מערכת ניהול פינוי, הובלה וקליטת ציוד</p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button className="w-full rounded-full bg-[#5F42FF] py-4 text-lg font-bold text-white">
            התחברות עם Google
          </button>
        </form>
      </div>
    </main>
  );
}
```

`src/app/role/page.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { ROLES, type Role } from '@/lib/contracts';
import { ROLE_LABELS } from '@/lib/labels';

// TODO: demo mode — anyone may pick any role (spec §1).
export default function RolePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pick(role: Role) {
    setBusy(true);
    await api.setRole(role);
    router.push(role === 'commander' ? '/command' : '/field');
    router.refresh();
  }

  return (
    <main className="min-h-dvh p-4 bg-[#665FB3] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6">
        <h1 className="text-xl font-bold mb-4 text-center">מה התפקיד שלך היום?</h1>
        <div className="flex flex-col gap-3">
          {ROLES.map((role) => (
            <button
              key={role}
              disabled={busy}
              onClick={() => pick(role)}
              className="rounded-full border-2 border-[#5F42FF] py-4 text-lg font-bold text-[#5F42FF] disabled:opacity-50"
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: `RoleSwitcher`** — `src/components/RoleSwitcher.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ROLES, type Role } from '@/lib/contracts';
import { ROLE_LABELS } from '@/lib/labels';

/** Compact role dropdown + sign-out link, for the field and command headers. */
export function RoleSwitcher({ role }: { role: Role | null }) {
  const router = useRouter();

  async function change(next: Role) {
    await api.setRole(next);
    router.push(next === 'commander' ? '/command' : '/field');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        aria-label="החלפת תפקיד"
        value={role ?? ''}
        onChange={(e) => change(e.target.value as Role)}
        className="rounded-full border border-[#E5E5EA] bg-white px-3 py-1"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <a href="/api/auth/signout" className="text-[#005DF5]">
        יציאה
      </a>
    </div>
  );
}
```

- [ ] **Step 11: Manual verification**
  - Comment out `AUTH_BYPASS=1` in `.env`, `npm run dev`, open `http://localhost:3000` → `/login` → Google → `/role` → pick "אורז" → lands on `/field` (404 until P3 merges — fine).
  - `curl -i http://localhost:3000/api/groups` (no cookie) → `401` `{"error":"UNAUTHENTICATED",...}`.
  - Re-enable `AUTH_BYPASS=1` for everyday dev.

- [ ] **Step 12: Commit and merge (part of Checkpoint B)**

```bash
npm test && npm run build
git add -A && git commit -m "feat: Google sign-in with free role picker and role switcher"
git checkout main && git pull && git merge --ff-only p1/auth && git push
```

Post in chat: "Auth on main. Use `await requirePageActor()` in your layout and `<RoleSwitcher role={actor.role} />` in your header. Keep `AUTH_BYPASS=1` in local `.env`."

---

### Task 6: Deploy (Vercel + Neon)

**Files:** `docs/generated/notes.md` (create).

- [ ] **Step 1: Production database.** Neon → new project "maabara" → copy the pooled connection string (`...-pooler...?sslmode=require`).
- [ ] **Step 2: Migrate and seed production from your machine**

```bash
DATABASE_URL="<neon-url>" npx prisma migrate deploy
DATABASE_URL="<neon-url>" npm run demo:reset
```

Expected: migrations applied; `Demo data loaded`.

- [ ] **Step 3: Vercel.** Import GitHub repo `hackathon-021/maabara`, framework Next.js, production branch `main`. Environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. **Do not set `AUTH_BYPASS`.** Deploy.
- [ ] **Step 4: Google redirect URI.** Add `https://<project>.vercel.app/api/auth/callback/google` to the OAuth client. (Preview deployments have other URLs and can't sign in — test on the production URL only.)
- [ ] **Step 5: Verify on a phone** over mobile data: Google sign-in → role picker → `/field` loads. Post the URL in team chat.
- [ ] **Step 6: Record it** — create `docs/generated/notes.md`:

```markdown
# Working notes

## Deployment
- Production URL: https://<project>.vercel.app
- DB: Neon project "maabara" (pooled URL in Vercel env)
- Reset demo data: `DATABASE_URL="<neon-url>" npm run demo:reset`
- Google OAuth client: "<client name>" in GCP project "<project>"

## Checkpoint C bugs
```

```bash
git add docs/generated/notes.md && git commit -m "docs: deployment notes" && git push
```

---

### Task 7: Integration captain (H5 → H24)

**Files:** `docs/generated/notes.md`.

- [ ] **Step 1: After each merge to `main`**, pull and run `npm test && npm run build`. If red, find the PR in chat and ping its author immediately.
- [ ] **Step 2: Checkpoint C (H12)** — run plan.md §7 on the production URL with four phones + the laptop. For each failure add a line under `## Checkpoint C bugs` with its owner (plan.md §4) and post it in chat.
- [ ] **Step 3: Labels.** After a rehearsal packing run, print the QR labels shown on the packer's screen (or show them on a second phone) so scanning works live.
- [ ] **Step 4: Rehearse three times** (H20–H24) with `npm run demo:reset` against production between runs. Record a backup screen video of one full run.
