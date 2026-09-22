# P5 — Commander Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the relocation commander one screen that is always true — how much equipment has moved, which rooms are done, where the trucks are, what has been lost, and the full history of any box by its code.

**Architecture:** Two read models under `src/lib/` — `dashboard.ts` (one `DashboardDTO` per request) and `timeline.ts` (every event that touched one box) — behind two GET routes. The `/command` UI is a desktop page that polls `GET /api/dashboard` every 3 seconds and renders it as a hero figure, a KPI row, a rooms grid with meters, and three panels. Every number the screen shows is computed on the server; the client only formats.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, Prisma 6 + PostgreSQL, SWR, Vitest 3 (node environment).

**Spec:** `docs/generated/2026-09-22-mvp-design.md` (§6 commander dashboard, §3 zero-loss invariants, §4 lifecycle).
**Master plan (team split, file ownership, frozen contracts):** `docs/generated/plan.md` — §4 ownership, §5.1 `DashboardDTO` and `TimelineEventDTO`, §5.8 route table.
**Source material:** `personas/Inspector_persona.md` — this whole workstream exists to answer that persona's questions.

## Global Constraints

See `docs/generated/plan.md` → Global Constraints. The ones that bite this workstream:

- Hackathon MVP: prefer quick and demoable; mark every shortcut with `// TODO:` and a reason.
- Code, identifiers and comments in **English**. Every user-facing string in **Hebrew**. The app is RTL throughout (P3's root layout).
- UI follows P3's design tokens and kit. Never write a hex literal — use `bg-primary`, `bg-primary-soft`, `bg-surface`, `border-subtle`, `text-ink`, `text-ink-muted`, `text-ok`, `text-warn`, `text-danger`, `rounded-card` and the kit components.
- `DashboardDTO` and `TimelineEventDTO` are **frozen** (`docs/generated/plan.md` §5.1). You build exactly those shapes. If you think one needs a field, ask P1 in chat; do not patch `contracts.ts`.
- Only `src/lib/lifecycle/**` may write `status` columns, `status_events` or `notifications`. **Everything in this plan is a read.** The one exception is `tests/command/helpers.ts`, which writes rows directly to build read-model fixtures — the same thing P2's own read-model tests do (`docs/generated/plans/p2-lifecycle.md` Task 2).
- Dashboard polls every **3000 ms**. No WebSockets.
- API errors are always `{ error: ErrorCode, messageHe: string }` via `handle` from `src/lib/api/respond.ts`. Every route calls `requireActor()` first.
- Next.js 15 route params are async: `{ params }: { params: Promise<{ id: string }> }`.
- Never edit a file you do not own (`docs/generated/plan.md` §4). P5 owns: `src/lib/dashboard.ts`, `src/lib/timeline.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/packing-units/[id]/timeline/route.ts`, `src/app/command/**`, `src/components/command/**`, `tests/command/**`.

## What you depend on, and when

| You need | From | Available at |
|---|---|---|
| Contracts, `db`, `Tx`, `handle`, `requireActor`, `requirePageActor`, `RoleSwitcher`, seed data, `resetDb`/`seedFixture` | P1 | Checkpoint A (H1) |
| The UI kit (`@/components/ui`) and the design tokens | P3 Tasks 1–4 | ~H4 |
| `GET /api/packing-units?roomId=` (the room drill-down) and `GET /api/packing-units/by-code/:code` (box search) | P2 Task 2 | ~H3 |
| Real boxes, trucks, missing boxes and SMS rows to look at | P2 Tasks 5–7 + P3/P4 screens | Checkpoint B (H5) |

**Tasks 1–4 are unblocked at Checkpoint A** — they are server-side read models with database tests and need nothing from P2, P3 or P4. Do them first; they are also what everyone else's screens are judged against. From Task 5 on, rebase onto `main` for the kit.

## Conventions this plan commits to

Seven decisions the rest of the plan depends on. Read them before Task 1.

0. **`src/lib/dashboard.ts` and `src/lib/timeline.ts` are server-only and must never be imported by a client component.** Both import `db`, so pulling one export into a `'use client'` module drags Prisma into the browser bundle and breaks the build — on the deploy, not on the laptop. Anything the UI needs to compute (percentages, tile descriptors, labels) lives in `src/components/command/logic.ts`, which imports nothing but types. The client's only channel to these read models is `api.dashboard()` and `api.timeline(id)`.

1. **The KPIs count item quantities; `boxCounts` counts boxes.** Spec §6 asks for "items packed / in transit / received / distributed vs. total mapped" — those are quantities of equipment, not cartons. `boxCounts` is the separate per-status carton tally. Mixing the two is the easiest way to make this screen lie.

2. **The six KPI buckets partition the packed universe exactly.** Every `packing_unit_item` contributes its full quantity to exactly one bucket — except a `short` item, which splits between `distributed` (what was handed over) and `short` (what was not). So `packed + inTransit + received + distributed + missing + short` always equals the total quantity ever packed. This invariant is what lets a commander trust the row, and Task 1 tests it directly.

3. **`totalMapped` counts `transfer` and `salvage` only.** A `disposal` item is never packed, so including it in the denominator would mean the progress bar could never reach 100% and a finished operation would look unfinished.

4. **Aggregate in JavaScript, not in SQL.** The demo database holds tens of rows. Prisma relation aggregates are fiddly and this is a 24-hour build, so each read model fetches the rows it needs and reduces them in a pure, exported function. Those pure functions are where the interesting tests live. `// TODO: push these down into SQL if this ever meets real data.`

5. **A status colour never travels alone.** Running the palette validator on this dashboard's four status colours reports that `#B26A00` (warn) and `#1B7F3B` (ok) are ΔE 3.1 apart under protanopia — indistinguishable — and that `#C62828` (danger) and `#B26A00` are ΔE 13.3 apart even with full colour vision. The loss states are the entire point of this screen, so every one of them ships with its own glyph **and** its own Hebrew label, and the tone is decoration on top. The palette itself is P3's and does not change.

   *One deliberate deviation from the spec.* §6 says "missing and short counts in red". Here `חסר` is red and `בחוסר` is amber, because a whole box that never arrived and a partial shortfall are not the same severity and the commander triages them differently. Because the two tones are nearly indistinguishable anyway, the glyph and the label — not the colour — are what actually separate them, so nothing is lost by carrying the severity in the tone as well. If the demo audience expects both in red, changing `short`'s tone to `danger` in `kpiTiles` and `exceptionBadge` is a one-line edit each, plus the two tone assertions that pin the current choice (Task 5 and Task 7). The glyph and label assertions — the ones that matter — are unaffected.

6. **A failed poll never blanks the screen.** This page is open on a laptop for hours. When a refresh fails, the last good numbers stay up with a staleness note; only a dashboard that has never loaded shows an error instead of content.

## Review Focus

Input classes the spec implies that the happy path never reaches. Each one has a test in the task that owns the code.

1. **Amber and green are the same colour to a protanope, and amber and red are nearly the same to everyone.** Measured, not guessed: ΔE 3.1 (protan) and ΔE 13.3 (normal vision). `חסר` and `בחוסר` are the two numbers a commander scans for, so each carries a distinct glyph and label rather than a tone alone. → Tasks 5 and 7.
2. **An empty database.** `/command` is the first screen opened at kickoff and after every `npm run demo:reset`: nothing mapped, nothing packed, no trucks, no SMS. The percentage must be `0`, not `NaN`; `boxCounts` must carry all seven statuses at zero; every panel shows a Hebrew empty state instead of an empty box. → Tasks 1 and 5–7.
3. **Every packed unit counted exactly once.** `distributed` and `short` both draw from one row's quantity. Get the split wrong and the tiles stop summing to what was packed — and a commander who catches the numbers disagreeing once stops using the screen. → Task 1.
4. **An exception with no status event behind it** — a seeded box, or a row written outside the lifecycle. The panel must still list it, with a dash for the actor and a real timestamp, rather than crashing on `events[0].actorName`. → Task 3.
5. **A box searched by a code that does not exist, and a browser clock that disagrees with the server's.** Search answers in Hebrew and stays usable; a clock running ahead of the server must never render "updated 3 seconds from now". → Tasks 5 and 8.

---

### Task 1: Dashboard read model — the KPI row and the box counts

The numbers the whole screen leads with. Pure logic first, then the query that feeds it.

**Files:**
- Create: `src/lib/dashboard.ts`, `tests/command/helpers.ts`
- Test: `tests/command/kpis.test.ts`

**Interfaces:**
- Consumes (P1, Checkpoint A): `db` from `@/lib/db`; `DashboardDTO`, `ItemStatus`, `PackingUnitStatus`, `PACKING_UNIT_STATUSES` from `@/lib/contracts`; `resetDb`, `seedFixture`, `type Fixture` from `tests/helpers/db`.
- Produces:
  - `interface KpiRow { quantity: number; distributedQuantity: number; itemStatus: ItemStatus; boxStatus: PackingUnitStatus }`
  - `tallyKpis(rows: KpiRow[], totalMapped: number): DashboardDTO['kpis']`
  - `tallyBoxes(statuses: PackingUnitStatus[]): Record<PackingUnitStatus, number>`
  - `dashboardKpis(): Promise<{ kpis: DashboardDTO['kpis']; boxCounts: Record<PackingUnitStatus, number> }>`
  - `tests/command/helpers.ts`: `makeBox(fx, spec): Promise<number>`, `makeTruck(fx, spec): Promise<number>`, `makeEvent(spec): Promise<void>`, `makeNotification(body): Promise<void>`

- [ ] **Step 1: Branch**

From the repository root, wherever you cloned it:

```bash
git checkout main && git pull && git checkout -b p5/dashboard-kpis
```

- [ ] **Step 2: Write the fixture helper** — `tests/command/helpers.ts`

Read models are tested against real rows, so this builds them directly. That is deliberate and it is the same thing P2's read-model tests do — nothing here is a lifecycle action, and no production code writes a status.

```ts
import { db } from '@/lib/db';
import type { ItemStatus, PackingUnitStatus, PackingUnitType, TransportStatus } from '@/lib/contracts';
import type { Fixture } from '../helpers/db';

export interface BoxSpec {
  roomId: number;
  status: PackingUnitStatus;
  code?: string | null;
  type?: PackingUnitType;
  transportUnitId?: number | null;
  closedAt?: Date | null;
  items?: {
    mappingReportId: number;
    quantity: number;
    distributedQuantity?: number;
    itemStatus?: ItemStatus;
  }[];
}

/** A packing unit with its items, written straight in. Returns the new box id. */
export async function makeBox(fx: Fixture, spec: BoxSpec): Promise<number> {
  const unit = await db.packingUnit.create({
    data: {
      sourceRoomId: spec.roomId,
      packedById: fx.userId,
      status: spec.status,
      code: spec.code === undefined ? null : spec.code,
      type: spec.type ?? 'professional_carton',
      transportUnitId: spec.transportUnitId ?? null,
      closedAt: spec.closedAt ?? null,
      destBuilding: 'בניין 7',
      destFloor: 'קומה 2',
      destRoom: 'חדר 214',
    },
  });
  for (const i of spec.items ?? []) {
    await db.packingUnitItem.create({
      data: {
        packingUnitId: unit.id,
        mappingReportId: i.mappingReportId,
        quantity: i.quantity,
        distributedQuantity: i.distributedQuantity ?? 0,
        itemStatus: i.itemStatus ?? 'packed',
      },
    });
  }
  return unit.id;
}

export interface TruckSpec {
  status: TransportStatus;
  licensePlate?: string;
  type?: 'truck' | 'other';
  departedAt?: Date | null;
}

export async function makeTruck(fx: Fixture, spec: TruckSpec): Promise<number> {
  const truck = await db.transportUnit.create({
    data: {
      groupId: fx.groupId,
      createdById: fx.userId,
      status: spec.status,
      licensePlate: spec.licensePlate ?? '12-345-67',
      type: spec.type ?? 'truck',
      departedAt: spec.departedAt ?? null,
    },
  });
  return truck.id;
}

export async function makeEvent(spec: {
  entityType: string;
  entityId: number;
  fromStatus?: string | null;
  toStatus: string;
  actorId: number;
  at?: Date;
  note?: string | null;
}): Promise<void> {
  await db.statusEvent.create({
    data: {
      entityType: spec.entityType,
      entityId: spec.entityId,
      fromStatus: spec.fromStatus ?? null,
      toStatus: spec.toStatus,
      actorId: spec.actorId,
      at: spec.at ?? new Date(),
      note: spec.note ?? null,
    },
  });
}

export async function makeNotification(body: string, at?: Date): Promise<void> {
  await db.notification.create({
    data: {
      body,
      recipients: 'מנהלת המעברים',
      entityType: 'transport_unit',
      entityId: 1,
      createdAt: at ?? new Date(),
    },
  });
}
```

- [ ] **Step 3: Write the failing test** — `tests/command/kpis.test.ts`

The pure tally is tested exhaustively because it is cheap; the query gets three cases proving it feeds the tally the right rows.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PACKING_UNIT_STATUSES } from '@/lib/contracts';
import { dashboardKpis, tallyBoxes, tallyKpis, type KpiRow } from '@/lib/dashboard';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox } from './helpers';

const row = (over: Partial<KpiRow> = {}): KpiRow => ({
  quantity: 1,
  distributedQuantity: 0,
  itemStatus: 'packed',
  boxStatus: 'closed',
  ...over,
});

describe('tallyKpis', () => {
  it('starts at zero for every bucket', () => {
    expect(tallyKpis([], 0)).toEqual({
      totalMapped: 0,
      packed: 0,
      inTransit: 0,
      received: 0,
      distributed: 0,
      missing: 0,
      short: 0,
    });
  });

  it('separates a packed box still at the source from one already on the road', () => {
    const k = tallyKpis(
      [
        row({ quantity: 2, boxStatus: 'closed' }),
        row({ quantity: 3, boxStatus: 'open' }),
        row({ quantity: 4, boxStatus: 'in_transit' }),
      ],
      20,
    );
    expect(k.packed).toBe(5);
    expect(k.inTransit).toBe(4);
  });

  it('counts received and fully distributed items', () => {
    const k = tallyKpis(
      [
        row({ quantity: 3, itemStatus: 'received', boxStatus: 'received' }),
        row({ quantity: 2, distributedQuantity: 2, itemStatus: 'distributed', boxStatus: 'distributed' }),
      ],
      20,
    );
    expect(k.received).toBe(3);
    expect(k.distributed).toBe(2);
  });

  it('counts a missing item as lost, not as packed', () => {
    const k = tallyKpis([row({ quantity: 5, itemStatus: 'missing', boxStatus: 'missing' })], 20);
    expect(k.missing).toBe(5);
    expect(k.packed).toBe(0);
  });

  // Conventions #2 — a short row is the only one that lands in two buckets.
  it('splits a short item between what was handed over and what was not', () => {
    const k = tallyKpis(
      [row({ quantity: 5, distributedQuantity: 2, itemStatus: 'short', boxStatus: 'distributed_short' })],
      20,
    );
    expect(k.distributed).toBe(2);
    expect(k.short).toBe(3);
  });

  // Review Focus 3.
  it('counts every packed unit exactly once, across every state at once', () => {
    const rows: KpiRow[] = [
      row({ quantity: 2, boxStatus: 'closed' }),
      row({ quantity: 4, boxStatus: 'in_transit' }),
      row({ quantity: 3, itemStatus: 'received', boxStatus: 'received' }),
      row({ quantity: 6, distributedQuantity: 6, itemStatus: 'distributed', boxStatus: 'distributed' }),
      row({ quantity: 5, distributedQuantity: 2, itemStatus: 'short', boxStatus: 'distributed_short' }),
      row({ quantity: 7, itemStatus: 'missing', boxStatus: 'missing' }),
    ];
    const k = tallyKpis(rows, 40);
    const totalPacked = rows.reduce((s, r) => s + r.quantity, 0);
    expect(k.packed + k.inTransit + k.received + k.distributed + k.missing + k.short).toBe(totalPacked);
    expect(totalPacked).toBe(27);
  });

  it('passes the mapped total through untouched', () => {
    expect(tallyKpis([], 14).totalMapped).toBe(14);
  });
});

describe('tallyBoxes', () => {
  // Review Focus 2: the DTO is Record<PackingUnitStatus, number>; a missing key prints "undefined".
  it('carries every status, at zero, for an empty operation', () => {
    const counts = tallyBoxes([]);
    expect(Object.keys(counts).sort()).toEqual([...PACKING_UNIT_STATUSES].sort());
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('counts boxes per status', () => {
    expect(tallyBoxes(['closed', 'closed', 'in_transit', 'missing'])).toMatchObject({
      closed: 2,
      in_transit: 1,
      missing: 1,
      open: 0,
      distributed: 0,
    });
  });
});

describe('dashboardKpis', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('reports an empty operation without crashing', async () => {
    const { kpis, boxCounts } = await dashboardKpis();
    // The fixture maps laptop x2 + monitor x1 + chair x1; the disposal printer is excluded.
    expect(kpis.totalMapped).toBe(4);
    expect(kpis.packed).toBe(0);
    expect(Object.values(boxCounts).every((n) => n === 0)).toBe(true);
  });

  it('reads item quantities and box statuses out of the database', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      code: '10002',
      items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }],
    });

    const { kpis, boxCounts } = await dashboardKpis();
    expect(kpis).toMatchObject({ totalMapped: 4, inTransit: 2, packed: 1 });
    expect(boxCounts).toMatchObject({ in_transit: 1, closed: 1, missing: 0 });
  });

  it('leaves the disposal printer out of the mapped total', async () => {
    // The fixture holds five mapped rows' worth of quantity — laptop 2, monitor 1,
    // chair 1, printer 1 — but the printer is `disposal` and is never packed,
    // so a finished operation must still be able to reach 100%.
    const { kpis } = await dashboardKpis();
    expect(kpis.totalMapped).toBe(4);
  });
});
```

- [ ] **Step 4: Run it to watch it fail**

```bash
npm test -- tests/command/kpis.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/dashboard'`.

If instead you get `Refusing to run tests: DATABASE_URL in .env.test must point at a *test* database`, that is `tests/setup.ts` doing its job — create `.env.test` and run `npm run db:test:migrate` as described at Checkpoint A. Unlike P3's and P4's tests, **these really do need the test database**.

- [ ] **Step 5: Write `src/lib/dashboard.ts`**

```ts
import type { DashboardDTO, ItemStatus, PackingUnitStatus } from '@/lib/contracts';
import { PACKING_UNIT_STATUSES } from '@/lib/contracts';
import { db } from '@/lib/db';

export interface KpiRow {
  quantity: number;
  distributedQuantity: number;
  itemStatus: ItemStatus;
  boxStatus: PackingUnitStatus;
}

/**
 * Where every packed unit of equipment is right now, counted in item quantities.
 *
 * The six buckets partition the packed universe exactly: each row contributes its
 * whole quantity to one bucket, except a `short` row, which splits between what was
 * actually handed over and what was not. That is what makes the KPI row add up.
 */
export function tallyKpis(rows: KpiRow[], totalMapped: number): DashboardDTO['kpis'] {
  const k = { totalMapped, packed: 0, inTransit: 0, received: 0, distributed: 0, missing: 0, short: 0 };

  for (const r of rows) {
    switch (r.itemStatus) {
      case 'missing':
        k.missing += r.quantity;
        break;
      case 'short':
        k.distributed += r.distributedQuantity;
        k.short += r.quantity - r.distributedQuantity;
        break;
      case 'distributed':
        k.distributed += r.quantity;
        break;
      case 'received':
        k.received += r.quantity;
        break;
      case 'packed':
        // Still packed: the box's own status says whether it has left the source.
        if (r.boxStatus === 'in_transit') k.inTransit += r.quantity;
        else k.packed += r.quantity;
        break;
    }
  }

  return k;
}

/** Cartons per status. Every status is present, at zero, so the UI never indexes a missing key. */
export function tallyBoxes(statuses: PackingUnitStatus[]): Record<PackingUnitStatus, number> {
  const counts = Object.fromEntries(PACKING_UNIT_STATUSES.map((s) => [s, 0])) as Record<
    PackingUnitStatus,
    number
  >;
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
}

export async function dashboardKpis(): Promise<{
  kpis: DashboardDTO['kpis'];
  boxCounts: Record<PackingUnitStatus, number>;
}> {
  // TODO: three small queries reduced in JS. Fine for a demo database; push down into SQL for real data.
  const [items, mapped, boxes] = await Promise.all([
    db.packingUnitItem.findMany({
      select: {
        quantity: true,
        distributedQuantity: true,
        itemStatus: true,
        packingUnit: { select: { status: true } },
      },
    }),
    // transfer + salvage only: a disposal item is never packed, so it is not part of the target.
    db.mappingReport.aggregate({
      where: { isAvailable: true, status: { in: ['transfer', 'salvage'] } },
      _sum: { quantity: true },
    }),
    db.packingUnit.findMany({ select: { status: true } }),
  ]);

  const rows: KpiRow[] = items.map((i) => ({
    quantity: i.quantity,
    distributedQuantity: i.distributedQuantity,
    itemStatus: i.itemStatus as ItemStatus,
    boxStatus: i.packingUnit.status as PackingUnitStatus,
  }));

  return {
    // _sum is null on an empty table.
    kpis: tallyKpis(rows, mapped._sum.quantity ?? 0),
    boxCounts: tallyBoxes(boxes.map((b) => b.status as PackingUnitStatus)),
  };
}
```

- [ ] **Step 6: Run the test**

```bash
npm test -- tests/command/kpis.test.ts
```

Expected: PASS, all sixteen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard.ts tests/command
git commit -m "feat(command): dashboard KPI and box-count read model"
```

---

### Task 2: Dashboard read model — rooms and trucks

Spec §6: the source-rooms grid with packed-vs-mapped, and the trucks list.

**Files:**
- Modify: `src/lib/dashboard.ts` (append)
- Test: `tests/command/rooms-trucks.test.ts`

**Interfaces:**
- Consumes: Task 1's module; `RoomStatus`, `TransportStatus`, `TransportType` from `@/lib/contracts`; `makeBox`, `makeTruck` from `tests/command/helpers`.
- Produces:
  - `dashboardRooms(): Promise<DashboardDTO['rooms']>`
  - `dashboardTrucks(): Promise<DashboardDTO['trucks']>`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/dashboard-rooms-trucks
```

- [ ] **Step 2: Write the failing test** — `tests/command/rooms-trucks.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { dashboardRooms, dashboardTrucks } from '@/lib/dashboard';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeTruck } from './helpers';

describe('dashboardRooms', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('reports every room with its group and its mapped total', async () => {
    const rooms = await dashboardRooms();
    const a = rooms.find((r) => r.id === fx.roomA);
    expect(a).toMatchObject({ status: 'done', mappedQty: 3, packedQty: 0 });
    expect(a?.groupName).toBeTruthy();
    expect(a?.description).toBeTruthy();
  });

  it('leaves a disposal item out of the mapped total', async () => {
    // fx.roomB: chair x1 (transfer) + printer x1 (disposal).
    expect((await dashboardRooms()).find((r) => r.id === fx.roomB)?.mappedQty).toBe(1);
  });

  it('adds up what has been packed out of the room, across boxes', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }],
    });
    expect((await dashboardRooms()).find((r) => r.id === fx.roomA)?.packedQty).toBe(3);
  });

  // Review Focus 2: a room nobody has mapped yet still has to render.
  it('reports an unmapped room as zero rather than omitting it', async () => {
    const room = (await dashboardRooms()).find((r) => r.id === fx.roomUnmapped);
    expect(room).toMatchObject({ mappedQty: 0, packedQty: 0, status: 'waiting' });
  });

  it('keeps a stable order so the grid does not reshuffle under the poll', async () => {
    const first = (await dashboardRooms()).map((r) => r.id);
    const second = (await dashboardRooms()).map((r) => r.id);
    expect(second).toEqual(first);
  });
});

describe('dashboardTrucks', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('is empty before anything is loaded', async () => {
    expect(await dashboardTrucks()).toEqual([]);
  });

  it('reports the plate, the status, the box count and the departure time', async () => {
    const departedAt = new Date(2026, 8, 22, 14, 5);
    const truckId = await makeTruck(fx, { status: 'in_transit', licensePlate: '12-345-67', departedAt });
    await makeBox(fx, { roomId: fx.roomA, status: 'in_transit', code: '10001', transportUnitId: truckId });
    await makeBox(fx, { roomId: fx.roomA, status: 'in_transit', code: '10002', transportUnitId: truckId });

    expect(await dashboardTrucks()).toEqual([
      {
        id: truckId,
        licensePlate: '12-345-67',
        type: 'truck',
        status: 'in_transit',
        boxCount: 2,
        departedAt: departedAt.toISOString(),
      },
    ]);
  });

  it('reports a truck that has not departed with a null departure time', async () => {
    await makeTruck(fx, { status: 'loading' });
    expect((await dashboardTrucks())[0]).toMatchObject({ status: 'loading', boxCount: 0, departedAt: null });
  });

  it('puts the newest transport unit first', async () => {
    await makeTruck(fx, { status: 'released', licensePlate: '11-111-11' });
    await makeTruck(fx, { status: 'loading', licensePlate: '22-222-22' });
    expect((await dashboardTrucks()).map((t) => t.licensePlate)).toEqual(['22-222-22', '11-111-11']);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/rooms-trucks.test.ts
```

Expected: FAIL — `dashboardRooms` and `dashboardTrucks` are not exported yet.

- [ ] **Step 4: Append to `src/lib/dashboard.ts`**

Merge the new type imports into the file's existing `import type { ... } from '@/lib/contracts'` line rather than adding a second import from the same module.

```ts
import type { RoomStatus, TransportStatus, TransportType } from '@/lib/contracts';

/** Source rooms with their mapped-versus-packed progress (spec §6). */
export async function dashboardRooms(): Promise<DashboardDTO['rooms']> {
  const rooms = await db.room.findMany({
    where: { isAvailable: true },
    // Stable order: the grid must not reshuffle under a 3-second poll.
    orderBy: [{ groupId: 'asc' }, { description: 'asc' }],
    select: {
      id: true,
      description: true,
      status: true,
      group: { select: { name: true } },
      mappingReports: { where: { isAvailable: true }, select: { status: true, quantity: true } },
      packingUnits: { select: { items: { select: { quantity: true } } } },
    },
  });

  return rooms.map((r) => ({
    id: r.id,
    groupName: r.group.name,
    description: r.description,
    status: r.status as RoomStatus,
    mappedQty: r.mappingReports
      .filter((m) => m.status !== 'disposal')
      .reduce((sum, m) => sum + m.quantity, 0),
    packedQty: r.packingUnits.reduce(
      (sum, u) => sum + u.items.reduce((inner, i) => inner + i.quantity, 0),
      0,
    ),
  }));
}

/** Transport units, newest first (spec §6). */
export async function dashboardTrucks(): Promise<DashboardDTO['trucks']> {
  const trucks = await db.transportUnit.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      licensePlate: true,
      type: true,
      status: true,
      departedAt: true,
      _count: { select: { packingUnits: true } },
    },
  });

  return trucks.map((t) => ({
    id: t.id,
    licensePlate: t.licensePlate,
    type: t.type as TransportType,
    status: t.status as TransportStatus,
    boxCount: t._count.packingUnits,
    departedAt: t.departedAt?.toISOString() ?? null,
  }));
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/rooms-trucks.test.ts
```

Expected: PASS, all nine.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard.ts tests/command
git commit -m "feat(command): rooms and trucks read models"
```

---

### Task 3: Dashboard read model — exceptions, the SMS feed, and `GET /api/dashboard`

Spec §6: "every `missing` box and `short` item, with last actor and last known status from `status_events`". The panel the inspector persona actually opens this screen for. Review Focus 4 lives here.

**Files:**
- Create: `src/app/api/dashboard/route.ts`
- Modify: `src/lib/dashboard.ts` (append)
- Test: `tests/command/exceptions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `handle` from `@/lib/api/respond`; `requireActor` from `@/lib/session`; `makeEvent`, `makeNotification` from `tests/command/helpers`.
- Produces:
  - `dashboardExceptions(): Promise<DashboardDTO['exceptions']>`
  - `dashboardNotifications(): Promise<DashboardDTO['notifications']>`
  - `getDashboard(): Promise<DashboardDTO>`
  - `GET /api/dashboard`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/dashboard-exceptions
```

- [ ] **Step 2: Write the failing test** — `tests/command/exceptions.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { dashboardExceptions, dashboardNotifications, getDashboard } from '@/lib/dashboard';
import { db } from '@/lib/db';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeEvent, makeNotification, makeTruck } from './helpers';

describe('dashboardExceptions', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('is empty when nothing has been lost', async () => {
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'received',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'received' }],
    });
    expect(await dashboardExceptions()).toEqual([]);
  });

  it('reports a missing box with the last actor and time from its events', async () => {
    const at = new Date(2026, 8, 22, 16, 30);
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'missing',
      code: '10002',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'missing' }],
    });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'missing', actorId: fx.userId, at });

    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({
      kind: 'missing_box',
      packingUnitId: boxId,
      packingUnitCode: '10002',
      at: at.toISOString(),
    });
    expect(exception.description).toContain('10002');
    expect(exception.lastActorName).toBeTruthy();
  });

  it('reports a short item with how much of it arrived', async () => {
    const at = new Date(2026, 8, 22, 17, 0);
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'distributed_short',
      code: '10003',
      items: [
        { mappingReportId: fx.reports.laptop, quantity: 2, distributedQuantity: 1, itemStatus: 'short' },
      ],
    });
    // The item's own event is what the panel attributes the shortage to.
    const item = await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } });
    await makeEvent({ entityType: 'packing_unit_item', entityId: item.id, toStatus: 'short', actorId: fx.userId, at });

    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({
      kind: 'short_item',
      packingUnitId: boxId,
      packingUnitCode: '10003',
      at: at.toISOString(),
    });
    expect(exception.description).toBe('מחשב נייד: פוזרו 1 מתוך 2');
  });

  // Review Focus 4.
  it('still lists a missing box that has no status event behind it', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10004' });
    const [exception] = await dashboardExceptions();
    expect(exception).toMatchObject({ kind: 'missing_box', packingUnitId: boxId, lastActorName: '—' });
    expect(exception.at).toBeTruthy();
    expect(Number.isNaN(Date.parse(exception.at))).toBe(false);
  });

  it('uses the most recent event when a box has several', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10005' });
    await makeEvent({
      entityType: 'packing_unit',
      entityId: boxId,
      toStatus: 'in_transit',
      actorId: fx.userId,
      at: new Date(2026, 8, 22, 14, 0),
    });
    await makeEvent({
      entityType: 'packing_unit',
      entityId: boxId,
      toStatus: 'missing',
      actorId: fx.userId,
      at: new Date(2026, 8, 22, 16, 0),
    });
    expect((await dashboardExceptions())[0].at).toBe(new Date(2026, 8, 22, 16, 0).toISOString());
  });

  it('puts the newest exception first', async () => {
    const older = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10006' });
    const newer = await makeBox(fx, { roomId: fx.roomA, status: 'missing', code: '10007' });
    await makeEvent({ entityType: 'packing_unit', entityId: older, toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 10, 0) });
    await makeEvent({ entityType: 'packing_unit', entityId: newer, toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 18, 0) });
    expect((await dashboardExceptions()).map((e) => e.packingUnitCode)).toEqual(['10007', '10006']);
  });
});

describe('dashboardNotifications', () => {
  beforeEach(async () => {
    await resetDb();
    await seedFixture();
  });

  it('is empty before anything has been sent', async () => {
    expect(await dashboardNotifications()).toEqual([]);
  });

  it('returns the feed newest first', async () => {
    await makeNotification('יחידת הובלה הועמסה', new Date(2026, 8, 22, 14, 0));
    await makeNotification('יחידת הובלה שוחררה', new Date(2026, 8, 22, 17, 0));
    expect((await dashboardNotifications()).map((n) => n.body)).toEqual([
      'יחידת הובלה שוחררה',
      'יחידת הובלה הועמסה',
    ]);
  });
});

describe('getDashboard', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  // Review Focus 2: this is the very first thing anyone opens.
  it('answers on an untouched database', async () => {
    const d = await getDashboard();
    expect(d.kpis.packed).toBe(0);
    expect(d.rooms.length).toBeGreaterThan(0);
    expect(d.trucks).toEqual([]);
    expect(d.exceptions).toEqual([]);
    expect(d.notifications).toEqual([]);
    expect(Number.isNaN(Date.parse(d.generatedAt))).toBe(false);
  });

  it('carries every section of the DTO at once', async () => {
    const truckId = await makeTruck(fx, { status: 'in_transit', departedAt: new Date() });
    await makeBox(fx, {
      roomId: fx.roomA,
      status: 'in_transit',
      code: '10001',
      transportUnitId: truckId,
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    await makeNotification('יחידת הובלה הועמסה');

    const d = await getDashboard();
    expect(d.kpis.inTransit).toBe(2);
    expect(d.boxCounts.in_transit).toBe(1);
    expect(d.trucks).toHaveLength(1);
    expect(d.notifications).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/exceptions.test.ts
```

Expected: FAIL — `dashboardExceptions` is not exported yet.

- [ ] **Step 4: Append to `src/lib/dashboard.ts`**

```ts
/** Nobody to attribute a row to — a seeded box, or one written outside the lifecycle. */
const UNKNOWN_ACTOR = '—';

/**
 * Every missing box and every short item, with the last actor and time from
 * `status_events` (spec §6). A row with no event behind it is still reported —
 * an unattributed loss is exactly the thing that must not disappear.
 */
export async function dashboardExceptions(): Promise<DashboardDTO['exceptions']> {
  const [missingBoxes, shortItems] = await Promise.all([
    db.packingUnit.findMany({
      where: { status: 'missing' },
      select: {
        id: true,
        code: true,
        openedAt: true,
        sourceRoom: { select: { description: true } },
      },
    }),
    db.packingUnitItem.findMany({
      where: { itemStatus: 'short' },
      select: {
        id: true,
        quantity: true,
        distributedQuantity: true,
        mappingReport: { select: { subCategory: { select: { description: true } } } },
        packingUnit: { select: { id: true, code: true, openedAt: true } },
      },
    }),
  ]);

  const events = await db.statusEvent.findMany({
    where: {
      OR: [
        { entityType: 'packing_unit', entityId: { in: missingBoxes.map((b) => b.id) } },
        { entityType: 'packing_unit_item', entityId: { in: shortItems.map((i) => i.id) } },
      ],
    },
    orderBy: { at: 'desc' },
    select: { entityType: true, entityId: true, at: true, actor: { select: { name: true } } },
  });

  // Ordered newest first, so the first row seen for a key is the latest one.
  const latest = new Map<string, { at: Date; actorName: string }>();
  for (const e of events) {
    const key = `${e.entityType}:${e.entityId}`;
    if (!latest.has(key)) latest.set(key, { at: e.at, actorName: e.actor.name });
  }

  const rows: DashboardDTO['exceptions'] = [];

  for (const b of missingBoxes) {
    const last = latest.get(`packing_unit:${b.id}`);
    rows.push({
      kind: 'missing_box',
      packingUnitId: b.id,
      packingUnitCode: b.code,
      description: `אריזה ${b.code ?? '—'} מ${b.sourceRoom.description}`,
      lastActorName: last?.actorName ?? UNKNOWN_ACTOR,
      at: (last?.at ?? b.openedAt).toISOString(),
    });
  }

  for (const i of shortItems) {
    const last = latest.get(`packing_unit_item:${i.id}`);
    rows.push({
      kind: 'short_item',
      packingUnitId: i.packingUnit.id,
      packingUnitCode: i.packingUnit.code,
      description: `${i.mappingReport.subCategory.description}: פוזרו ${i.distributedQuantity} מתוך ${i.quantity}`,
      lastActorName: last?.actorName ?? UNKNOWN_ACTOR,
      at: (last?.at ?? i.packingUnit.openedAt).toISOString(),
    });
  }

  // ISO strings sort lexicographically, so this is a plain reverse-chronological sort.
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** The mocked SMS outbox, newest first. */
export async function dashboardNotifications(): Promise<DashboardDTO['notifications']> {
  const rows = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
    // TODO: the feed is a demo artefact; a cap keeps it readable across rehearsals.
    take: 20,
  });
  return rows.map((n) => ({
    id: n.id,
    body: n.body,
    recipients: n.recipients,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getDashboard(): Promise<DashboardDTO> {
  const [kpiPart, rooms, trucks, exceptions, notifications] = await Promise.all([
    dashboardKpis(),
    dashboardRooms(),
    dashboardTrucks(),
    dashboardExceptions(),
    dashboardNotifications(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    kpis: kpiPart.kpis,
    boxCounts: kpiPart.boxCounts,
    rooms,
    trucks,
    exceptions,
    notifications,
  };
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/exceptions.test.ts
```

Expected: PASS, all eleven.

- [ ] **Step 6: Write `src/app/api/dashboard/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { getDashboard } from '@/lib/dashboard';
import { requireActor } from '@/lib/session';

// Polled every 3 seconds; never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await requireActor();
    return getDashboard();
  });
}
```

- [ ] **Step 7: Smoke the route**

With `AUTH_BYPASS=1` in `.env`:

```bash
npm run dev
```

```bash
curl -s http://localhost:3000/api/dashboard | head -c 400
```

Expected: JSON starting with `{"generatedAt":"2026-...","kpis":{"totalMapped":14,...`. The seed maps 14 transferable/salvageable units across rooms 101, 102 and 201.

- [ ] **Step 8: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/lib/dashboard.ts src/app/api/dashboard tests/command
git commit -m "feat(command): exceptions, SMS feed and GET /api/dashboard"
```

Post in chat: *"`GET /api/dashboard` is on main — `api.dashboard()` works. KPIs count item quantities; `boxCounts` counts cartons."*

---

### Task 4: The box timeline and its route

Spec §6, box search: "code → full event timeline". This is demo step 5 — the moment the whole audit trail pays off.

**Files:**
- Create: `src/lib/timeline.ts`, `src/app/api/packing-units/[id]/timeline/route.ts`
- Test: `tests/command/timeline.test.ts`

**Interfaces:**
- Consumes: `statusLabel` from `@/lib/labels`; `Errors` from `@/lib/errors`; `EntityType`, `TimelineEventDTO` from `@/lib/contracts`; `makeBox`, `makeTruck`, `makeEvent` from `tests/command/helpers`.
- Produces:
  - `timelineLabel(entityType: EntityType, toStatus: string, subject: string): string`
  - `getTimeline(packingUnitId: number): Promise<TimelineEventDTO[]>`
  - `GET /api/packing-units/:id/timeline`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/timeline
```

- [ ] **Step 2: Write the failing test** — `tests/command/timeline.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getTimeline, timelineLabel } from '@/lib/timeline';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';
import { makeBox, makeEvent, makeTruck } from './helpers';

describe('timelineLabel', () => {
  it('names a box by its code and its status in Hebrew', () => {
    expect(timelineLabel('packing_unit', 'missing', '10002')).toBe('אריזה 10002: אריזה חסרה');
  });

  // The shape the frozen contract documents.
  it('quotes an item by name', () => {
    expect(timelineLabel('packing_unit_item', 'packed', 'מחשב נייד')).toBe('פריט "מחשב נייד": פריט נארז');
  });

  it('names a transport unit by its plate', () => {
    expect(timelineLabel('transport_unit', 'released', '12-345-67')).toBe(
      'יחידת הובלה 12-345-67: יחידת הובלה שוחררה',
    );
  });

  it('reads the transport pseudo-status that only statusLabel knows about', () => {
    expect(timelineLabel('transport_unit', 'unloaded', '12-345-67')).toContain('נפרקה במלואה');
  });
});

describe('getTimeline', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('refuses a box that does not exist', async () => {
    await expect(getTimeline(9999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns nothing for a box with no events yet', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'open' });
    expect(await getTimeline(boxId)).toEqual([]);
  });

  it('tells the box story, its items and its truck, oldest first', async () => {
    const truckId = await makeTruck(fx, { status: 'released', licensePlate: '12-345-67' });
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'missing',
      code: '10002',
      transportUnitId: truckId,
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2, itemStatus: 'missing' }],
    });
    const itemId = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } })).id;

    await makeEvent({ entityType: 'packing_unit', entityId: boxId, fromStatus: null, toStatus: 'open', actorId: fx.userId, at: new Date(2026, 8, 22, 10, 0) });
    await makeEvent({ entityType: 'packing_unit_item', entityId: itemId, fromStatus: null, toStatus: 'packed', actorId: fx.userId, at: new Date(2026, 8, 22, 11, 0) });
    await makeEvent({ entityType: 'transport_unit', entityId: truckId, fromStatus: 'loading', toStatus: 'in_transit', actorId: fx.userId, at: new Date(2026, 8, 22, 12, 0) });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, fromStatus: 'in_transit', toStatus: 'missing', actorId: fx.userId, at: new Date(2026, 8, 22, 13, 0) });

    const timeline = await getTimeline(boxId);
    expect(timeline.map((e) => e.label)).toEqual([
      'אריזה 10002: אריזה בתהליך',
      'פריט "מחשב נייד": פריט נארז',
      'יחידת הובלה 12-345-67: יחידת הובלה בדרך',
      'אריזה 10002: אריזה חסרה',
    ]);
    expect(timeline[3]).toMatchObject({ entityType: 'packing_unit', fromStatus: 'in_transit', toStatus: 'missing' });
    expect(timeline[0].actorName).toBeTruthy();
  });

  it('leaves another box events out of this box story', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'closed', code: '10001' });
    const otherId = await makeBox(fx, { roomId: fx.roomA, status: 'closed', code: '10002' });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'closed', actorId: fx.userId });
    await makeEvent({ entityType: 'packing_unit', entityId: otherId, toStatus: 'closed', actorId: fx.userId });
    expect(await getTimeline(boxId)).toHaveLength(1);
  });

  // A close writes the box event and the item events inside one transaction, at one timestamp.
  it('orders events written at the same instant by insertion, not at random', async () => {
    const boxId = await makeBox(fx, {
      roomId: fx.roomA,
      status: 'closed',
      code: '10001',
      items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }],
    });
    const itemId = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: boxId } })).id;
    const at = new Date(2026, 8, 22, 12, 0);
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'closed', actorId: fx.userId, at });
    await makeEvent({ entityType: 'packing_unit_item', entityId: itemId, toStatus: 'packed', actorId: fx.userId, at });

    const ids = (await getTimeline(boxId)).map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  // Review Focus 5: a box gets its code at close, so its earlier events have none.
  it('labels a box that has no code yet without printing null', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'open', code: null });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'open', actorId: fx.userId });
    expect((await getTimeline(boxId))[0].label).toBe(`אריזה #${boxId}: אריזה בתהליך`);
  });

  it('carries the note a lifecycle action left behind', async () => {
    const boxId = await makeBox(fx, { roomId: fx.roomA, status: 'received', code: '10001' });
    await makeEvent({ entityType: 'packing_unit', entityId: boxId, toStatus: 'received', actorId: fx.userId, note: 'עודף' });
    expect((await getTimeline(boxId))[0].note).toBe('עודף');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/timeline.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/timeline'`.

- [ ] **Step 4: Write `src/lib/timeline.ts`**

```ts
import type { EntityType, TimelineEventDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

/**
 * One readable Hebrew line per event. `subject` is whatever identifies the entity
 * on screen — a box code, an item name, a licence plate.
 */
export function timelineLabel(entityType: EntityType, toStatus: string, subject: string): string {
  const status = statusLabel(entityType, toStatus);
  switch (entityType) {
    case 'packing_unit':
      return `אריזה ${subject}: ${status}`;
    case 'packing_unit_item':
      return `פריט "${subject}": ${status}`;
    case 'transport_unit':
      return `יחידת הובלה ${subject}: ${status}`;
    case 'room':
      return `${subject}: ${status}`;
  }
}

/**
 * Everything that happened to one box: its own events, its items', and those of the
 * transport unit it rode on. The truck's events are what answer "where did it go?".
 */
export async function getTimeline(packingUnitId: number): Promise<TimelineEventDTO[]> {
  const unit = await db.packingUnit.findUnique({
    where: { id: packingUnitId },
    select: {
      id: true,
      code: true,
      transportUnitId: true,
      transportUnit: { select: { id: true, licensePlate: true } },
      items: {
        select: {
          id: true,
          mappingReport: { select: { subCategory: { select: { description: true } } } },
        },
      },
    },
  });
  if (!unit) throw Errors.notFound('אריזה');

  // A box has no code until it closes, so its earliest events are labelled by id.
  const subjects = new Map<string, string>();
  subjects.set(`packing_unit:${unit.id}`, unit.code ?? `#${unit.id}`);
  for (const i of unit.items) {
    subjects.set(`packing_unit_item:${i.id}`, i.mappingReport.subCategory.description);
  }
  if (unit.transportUnit) {
    subjects.set(`transport_unit:${unit.transportUnit.id}`, unit.transportUnit.licensePlate);
  }

  const itemIds = unit.items.map((i) => i.id);
  const events = await db.statusEvent.findMany({
    where: {
      OR: [
        { entityType: 'packing_unit', entityId: unit.id },
        ...(itemIds.length > 0 ? [{ entityType: 'packing_unit_item', entityId: { in: itemIds } }] : []),
        ...(unit.transportUnitId !== null
          ? [{ entityType: 'transport_unit', entityId: unit.transportUnitId }]
          : []),
      ],
    },
    // Several events share one transaction timestamp; id breaks the tie deterministically.
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      at: true,
      entityType: true,
      entityId: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      actor: { select: { name: true } },
    },
  });

  return events.map((e) => {
    const entityType = e.entityType as EntityType;
    const subject = subjects.get(`${e.entityType}:${e.entityId}`) ?? String(e.entityId);
    return {
      id: e.id,
      at: e.at.toISOString(),
      entityType,
      entityId: e.entityId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      label: timelineLabel(entityType, e.toStatus, subject),
      actorName: e.actor.name,
      note: e.note,
    };
  });
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/timeline.test.ts
```

Expected: PASS, all twelve.

- [ ] **Step 6: Write `src/app/api/packing-units/[id]/timeline/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { Errors } from '@/lib/errors';
import { requireActor } from '@/lib/session';
import { getTimeline } from '@/lib/timeline';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireActor();
    const { id } = await params;
    const packingUnitId = Number(id);
    if (!Number.isInteger(packingUnitId)) throw Errors.notFound('אריזה');
    return getTimeline(packingUnitId);
  });
}
```

- [ ] **Step 7: Smoke the route**

```bash
npm run dev
```

```bash
curl -s http://localhost:3000/api/packing-units/1/timeline
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/packing-units/abc/timeline
```

Expected: `[]` (or events, if anyone has packed on your database) for the first, and `404` for the second — not a 500.

- [ ] **Step 8: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/lib/timeline.ts src/app/api/packing-units tests/command
git commit -m "feat(command): box timeline read model and route"
```

---

### Task 5: The `/command` shell, the hero figure and the KPI row

The page itself, the one big number it leads with, and the six tiles under it. Review Focus 1, 2 and 5 live here.

Two things from the visualization guidance shape this task, and both are deliberate:

- **This is a KPI row of stat tiles, not a chart.** A handful of headline numbers is a stat-tile row; a grouped bar chart of six values would be harder to read and slower to build. **Exactly one hero figure** per view — the overall percentage — at ≥48px.
- **Big standalone values use proportional figures; `tabular-nums` is for columns.** `tabular-nums` gives every digit the width of a zero, which makes a display-size number look loose. The tiles and the hero get proportional figures; the trucks table, the box lists and the timeline times get `tabular-nums` so their columns line up.

**Files:**
- Create: `src/app/command/layout.tsx`, `src/app/command/page.tsx`, `src/components/command/CommandDashboard.tsx`, `src/components/command/KpiTiles.tsx`, `src/components/command/Meter.tsx`, `src/components/command/logic.ts`, `src/components/command/format.ts`
- Test: `tests/command/ui-logic.test.ts`

**Interfaces:**
- Consumes: `api.dashboard()`; `requirePageActor` from `@/lib/session`; `RoleSwitcher`; `AppHeader`, `Banner`, `Card`, `Spinner`, `describeError` from `@/components/ui`.
- Produces (all in `src/components/command/logic.ts` unless noted — Conventions #0, this module never imports the server read models):
  - `formatHeDateTime(iso: string | null): string` in `src/components/command/format.ts`
  - `progressPercent(done: number, total: number): number`
  - `interface KpiTile { key: string; label: string; value: number; tone: 'neutral' | 'ok' | 'warn' | 'danger'; glyph: string | null }`
  - `kpiTiles(kpis: DashboardDTO['kpis']): KpiTile[]`
  - `handledTotal(kpis: DashboardDTO['kpis']): number`
  - `freshnessLabel(generatedAt: string, now: number): string`
  - `<Meter value max label? />`
  - `<KpiTiles kpis />`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/command-shell
```

- [ ] **Step 2: Write the failing test** — `tests/command/ui-logic.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from '@/components/command/format';
import { freshnessLabel, handledTotal, kpiTiles, progressPercent } from '@/components/command/logic';

const kpis = (over: Partial<DashboardDTO['kpis']> = {}): DashboardDTO['kpis'] => ({
  totalMapped: 40,
  packed: 2,
  inTransit: 4,
  received: 3,
  distributed: 8,
  missing: 7,
  short: 3,
  ...over,
});

describe('kpiTiles', () => {
  it('lays the six buckets out in chain order', () => {
    expect(kpiTiles(kpis()).map((t) => t.key)).toEqual([
      'packed',
      'inTransit',
      'received',
      'distributed',
      'missing',
      'short',
    ]);
  });

  it('reads each value off the KPIs', () => {
    const byKey = Object.fromEntries(kpiTiles(kpis()).map((t) => [t.key, t.value]));
    expect(byKey).toEqual({ packed: 2, inTransit: 4, received: 3, distributed: 8, missing: 7, short: 3 });
  });

  /**
   * Review Focus 1. Measured, not guessed: warn #B26A00 and ok #1B7F3B are ΔE 3.1
   * apart under protanopia, and danger #C62828 and warn are ΔE 13.3 apart with full
   * colour vision. The two loss tiles are what a commander scans for, so they must
   * differ by more than their tone.
   */
  it('gives every loss state its own glyph, not just its own colour', () => {
    const tiles = kpiTiles(kpis());
    const missing = tiles.find((t) => t.key === 'missing');
    const short = tiles.find((t) => t.key === 'short');
    expect(missing?.tone).toBe('danger');
    expect(short?.tone).toBe('warn');
    expect(missing?.glyph).toBeTruthy();
    expect(short?.glyph).toBeTruthy();
    expect(missing?.glyph).not.toBe(short?.glyph);
  });

  it('labels every tile in Hebrew, with no trailing colon', () => {
    for (const tile of kpiTiles(kpis())) {
      expect(tile.label.length).toBeGreaterThan(0);
      expect(tile.label.endsWith(':')).toBe(false);
    }
  });

  it('uses distinct labels so no two tiles read the same', () => {
    const labels = kpiTiles(kpis()).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('progressPercent', () => {
  it('rounds to a whole percent', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });

  // Review Focus 2: an unmapped room, and an empty database.
  it('is zero rather than NaN when nothing is mapped', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });

  it('never exceeds a hundred', () => {
    expect(progressPercent(12, 10)).toBe(100);
  });
});

describe('handledTotal', () => {
  it('adds up everything that has entered the chain', () => {
    expect(handledTotal(kpis())).toBe(27);
  });

  // Review Focus 2.
  it('is zero before anything has been packed', () => {
    expect(
      handledTotal(kpis({ packed: 0, inTransit: 0, received: 0, distributed: 0, missing: 0, short: 0 })),
    ).toBe(0);
  });
});

describe('freshnessLabel', () => {
  const at = (secondsAgo: number) => {
    const now = Date.UTC(2026, 8, 22, 14, 0, 0);
    return freshnessLabel(new Date(now - secondsAgo * 1000).toISOString(), now);
  };

  it('says "now" for a fresh poll', () => {
    expect(at(0)).toBe('עודכן עכשיו');
    expect(at(4)).toBe('עודכן עכשיו');
  });

  it('counts seconds, then minutes', () => {
    expect(at(30)).toBe('עודכן לפני 30 שניות');
    expect(at(120)).toBe('עודכן לפני 2 דקות');
  });

  // Review Focus 5: a laptop clock ahead of the server's must not read "in -3 seconds".
  it('never reports a time in the future', () => {
    const now = Date.UTC(2026, 8, 22, 14, 0, 0);
    expect(freshnessLabel(new Date(now + 5000).toISOString(), now)).toBe('עודכן עכשיו');
  });
});

describe('formatHeDateTime', () => {
  it('shows a day, a month and a time', () => {
    const iso = new Date(2026, 8, 22, 14, 5).toISOString();
    expect(formatHeDateTime(iso)).toBe('22/09 14:05');
  });

  it('pads single digits', () => {
    expect(formatHeDateTime(new Date(2026, 0, 3, 9, 7).toISOString())).toBe('03/01 09:07');
  });

  it('shows a dash when there is no timestamp', () => {
    expect(formatHeDateTime(null)).toBe('—');
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: FAIL — neither `@/components/command/logic` nor `@/components/command/format` exists.

- [ ] **Step 4: Write `src/components/command/format.ts`**

```ts
/**
 * Display formatting for the command screens.
 * // TODO: P4 keeps an identical twin at src/app/field/format.ts. They were written
 * in parallel by different people; fold them into one shared module if there is time.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "22/09 14:05" in the viewer's own timezone, or "—" when there is no timestamp. */
export function formatHeDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 5: Write `src/components/command/logic.ts`**

```ts
import type { DashboardDTO } from '@/lib/contracts';

// Conventions #0: types only. This module is in the browser bundle — never import
// @/lib/dashboard or @/lib/timeline here, they carry Prisma with them.

/** A whole percent, clamped, and zero rather than NaN when there is nothing to divide by. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export interface KpiTile {
  key: string;
  label: string;
  value: number;
  tone: 'neutral' | 'ok' | 'warn' | 'danger';
  /** Second channel for the status tones — see the comment below. */
  glyph: string | null;
}

/**
 * The six buckets, in chain order.
 *
 * The two loss tiles each carry their own glyph as well as their own tone. The
 * palette validator measures warn (#B26A00) against ok (#1B7F3B) at ΔE 3.1 under
 * protanopia and against danger (#C62828) at ΔE 13.3 with normal colour vision —
 * so a commander scanning for losses cannot be asked to tell them apart by colour.
 * The palette is P3's and stays as it is; the glyph is the fix.
 */
export function kpiTiles(k: DashboardDTO['kpis']): KpiTile[] {
  return [
    { key: 'packed', label: 'ארוז וממתין', value: k.packed, tone: 'neutral', glyph: null },
    { key: 'inTransit', label: 'בדרך', value: k.inTransit, tone: 'neutral', glyph: null },
    { key: 'received', label: 'התקבל ביעד', value: k.received, tone: 'neutral', glyph: null },
    { key: 'distributed', label: 'פוזר', value: k.distributed, tone: 'ok', glyph: '✔' },
    { key: 'missing', label: 'חסר', value: k.missing, tone: 'danger', glyph: '✕' },
    { key: 'short', label: 'בחוסר', value: k.short, tone: 'warn', glyph: '!' },
  ];
}

/** Everything that has entered the chain — the numerator of the headline figure. */
export function handledTotal(k: DashboardDTO['kpis']): number {
  return k.packed + k.inTransit + k.received + k.distributed + k.missing + k.short;
}

/** How old the numbers on screen are. Never negative, however the viewer's clock is set. */
export function freshnessLabel(generatedAt: string, now: number): string {
  const age = Math.max(0, Math.round((now - new Date(generatedAt).getTime()) / 1000));
  if (age < 10) return 'עודכן עכשיו';
  if (age < 60) return `עודכן לפני ${age} שניות`;
  return `עודכן לפני ${Math.round(age / 60)} דקות`;
}
```

- [ ] **Step 6: Run the test**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: PASS, all thirteen.

- [ ] **Step 7: Write `src/components/command/Meter.tsx`**

```tsx
import { progressPercent } from './logic';

/**
 * A single ratio against a limit. The fill is the brand hue and the track is a
 * lighter step of the same ramp (primary on primary-soft), so the state reads
 * across the whole bar rather than only where it stops.
 *
 * The page is dir="rtl", so the fill grows from the right on its own — do not add
 * a direction override here, it will silently render the bar backwards.
 */
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = progressPercent(value, max);
  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'התקדמות'}
      className="h-2 w-full overflow-hidden rounded-full bg-primary-soft"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
```

- [ ] **Step 8: Write `src/components/command/KpiTiles.tsx`**

```tsx
import { Card } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { handledTotal, kpiTiles, progressPercent, type KpiTile } from './logic';
import { Meter } from './Meter';

const TONE: Record<KpiTile['tone'], string> = {
  neutral: 'text-ink',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
};

/** The one number the dashboard leads with. Exactly one of these per view. */
export function HeroProgress({ kpis }: { kpis: DashboardDTO['kpis'] }) {
  const handled = handledTotal(kpis);
  const pct = progressPercent(handled, kpis.totalMapped);
  return (
    <Card>
      <p className="text-sm text-ink-muted">מהציוד שמופה כבר נכנס לתהליך</p>
      {/* Proportional figures on purpose: tabular-nums looks loose at display sizes. */}
      <p className="mt-1 text-6xl font-semibold leading-none">{pct}%</p>
      <p className="mt-2 mb-3 text-sm text-ink-muted">
        {handled} מתוך {kpis.totalMapped} פריטים
      </p>
      <Meter value={handled} max={kpis.totalMapped} label="התקדמות כוללת" />
    </Card>
  );
}

export function KpiTiles({ kpis }: { kpis: DashboardDTO['kpis'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {kpiTiles(kpis).map((tile) => (
        <Card key={tile.key}>
          <p className="text-sm text-ink-muted">{tile.label}</p>
          <p className={`mt-1 text-3xl font-semibold ${TONE[tile.tone]}`}>
            {tile.value}
            {tile.glyph && (
              <span aria-hidden className="ms-2 text-xl">
                {tile.glyph}
              </span>
            )}
          </p>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Write `src/app/command/layout.tsx` and `src/app/command/page.tsx`**

```tsx
// src/app/command/layout.tsx
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { AppHeader } from '@/components/ui';
import { requirePageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="min-h-dvh bg-page">
      <AppHeader title="המעברה — תמונת מצב" right={<RoleSwitcher role={actor.role} />} />
      <main className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</main>
    </div>
  );
}
```

```tsx
// src/app/command/page.tsx
import { CommandDashboard } from '@/components/command/CommandDashboard';

export const dynamic = 'force-dynamic';

export default function CommandPage() {
  return <CommandDashboard />;
}
```

- [ ] **Step 10: Write `src/components/command/CommandDashboard.tsx`**

Tasks 6–8 add the panels to this file; it starts with the hero, the tiles and the polling.

```tsx
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, describeError, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import { HeroProgress, KpiTiles } from './KpiTiles';
import { freshnessLabel } from './logic';

/** Spec §1: poll every 3 seconds. No WebSockets. */
const POLL_MS = 3000;

export function CommandDashboard() {
  const { data, error } = useSWR('dashboard', api.dashboard, {
    refreshInterval: POLL_MS,
    keepPreviousData: true,
  });

  // Re-render once a second so the freshness line counts up between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Only a dashboard that has never loaded shows an error instead of content.
  if (error && !data) return <Banner tone="danger">{describeError(error).messageHe}</Banner>;
  if (!data) return <Spinner label="טוען תמונת מצב…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-white/80">{freshnessLabel(data.generatedAt, now)}</p>
        {/* A failed poll leaves the last good numbers up, with a note. */}
        {error && <p className="text-sm text-white">אין תקשורת עם השרת — המספרים אינם מתעדכנים</p>}
      </div>

      <HeroProgress kpis={data.kpis} />
      <KpiTiles kpis={data.kpis} />
    </div>
  );
}
```

- [ ] **Step 11: Look at it**

```bash
npm run demo:reset
npm run dev
```

With `AUTH_BYPASS=1`, open `http://localhost:3000/command` on a laptop-width window. Expected: the purple page, a white header with the role dropdown, `0%` at display size, `0 מתוך 14 פריטים`, an empty meter, and six tiles reading zero — **not** `NaN%` and not a crash. That is Review Focus 2.

Now check the two things that only move: watch the freshness line tick from `עודכן עכשיו` up through `עודכן לפני 12 שניות`, and confirm the network tab shows a `/api/dashboard` request every 3 seconds. Then stop the dev server while the page is open: the numbers **stay on screen** with `אין תקשורת עם השרת` beside them. Restart it and the line goes back to `עודכן עכשיו`.

Finally, pack a box on another tab (P3's flow) and watch the tiles move within three seconds without a reload. If P3's screens are not merged yet, insert a row with `npx prisma studio` instead.

- [ ] **Step 12: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/app/command src/components/command tests/command
git commit -m "feat(command): dashboard shell, hero figure and KPI row"
```

---

### Task 6: The rooms grid and the room drill-down

Spec §6: "status + packed-vs-mapped progress bar; click → boxes in that room". The answer to the inspector persona's first question — *who has actually finished?*

**Files:**
- Create: `src/components/command/RoomsGrid.tsx`, `src/components/command/RoomBoxes.tsx`
- Modify: `src/components/command/CommandDashboard.tsx` (render the grid), `src/components/command/logic.ts` (append), `tests/command/ui-logic.test.ts` (append)

**Interfaces:**
- Consumes: `api.packingUnits({ roomId })` (P2 Task 2); `Card`, `Dialog`, `EmptyState`, `Spinner`, `StatusChip`, `describeError` from `@/components/ui`; `Meter` and `progressPercent` from Task 5.
- Produces:
  - `roomsByGroup(rooms: DashboardDTO['rooms']): { groupName: string; rooms: DashboardDTO['rooms'] }[]`
  - `<RoomsGrid rooms onOpen />`, `<RoomBoxes roomId roomName onClose />`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/rooms-grid
```

- [ ] **Step 2: Append the failing test to `tests/command/ui-logic.test.ts`**

```ts
import { roomsByGroup } from '@/components/command/logic';

const room = (id: number, groupName: string, description: string, over: Partial<DashboardDTO['rooms'][number]> = {}) => ({
  id,
  groupName,
  description,
  status: 'done' as const,
  mappedQty: 10,
  packedQty: 0,
  ...over,
});

describe('roomsByGroup', () => {
  it('groups rooms under their section, keeping the order they arrived in', () => {
    const grouped = roomsByGroup([
      room(1, 'ענף תקשוב', 'חדר 101'),
      room(2, 'ענף תקשוב', 'חדר 102'),
      room(3, 'ענף לוגיסטיקה', 'חדר 201'),
    ]);
    expect(grouped.map((g) => g.groupName)).toEqual(['ענף תקשוב', 'ענף לוגיסטיקה']);
    expect(grouped[0].rooms.map((r) => r.description)).toEqual(['חדר 101', 'חדר 102']);
    expect(grouped[1].rooms).toHaveLength(1);
  });

  it('keeps a group together even when its rooms are not adjacent', () => {
    const grouped = roomsByGroup([
      room(1, 'ענף תקשוב', 'חדר 101'),
      room(3, 'ענף לוגיסטיקה', 'חדר 201'),
      room(2, 'ענף תקשוב', 'חדר 102'),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].rooms).toHaveLength(2);
  });

  // Review Focus 2.
  it('returns nothing for an operation with no rooms', () => {
    expect(roomsByGroup([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: FAIL — `roomsByGroup` is not exported yet.

- [ ] **Step 4: Append to `src/components/command/logic.ts`**

```ts
/**
 * Rooms under their section heading. The server already returns them grouped and
 * sorted; this keeps a group together even if that ever changes, and preserves
 * arrival order so the grid does not reshuffle under the poll.
 */
export function roomsByGroup(
  rooms: DashboardDTO['rooms'],
): { groupName: string; rooms: DashboardDTO['rooms'] }[] {
  const groups: { groupName: string; rooms: DashboardDTO['rooms'] }[] = [];
  for (const room of rooms) {
    const existing = groups.find((g) => g.groupName === room.groupName);
    if (existing) existing.rooms.push(room);
    else groups.push({ groupName: room.groupName, rooms: [room] });
  }
  return groups;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/command/RoomBoxes.tsx`**

```tsx
'use client';

import useSWR from 'swr';
import { Banner, describeError, Dialog, EmptyState, Spinner, StatusChip } from '@/components/ui';
import { api } from '@/lib/api/client';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';

/** The drill-down: every box packed out of one room (spec §6). */
export function RoomBoxes({
  roomId,
  roomName,
  onClose,
}: {
  roomId: number;
  roomName: string;
  onClose: () => void;
}) {
  const boxes = useSWR(['room-boxes', roomId], () => api.packingUnits({ roomId }));

  return (
    <Dialog open title={`אריזות מ${roomName}`} onClose={onClose}>
      {boxes.error ? (
        <Banner tone="danger">{describeError(boxes.error).messageHe}</Banner>
      ) : !boxes.data ? (
        <Spinner />
      ) : boxes.data.length === 0 ? (
        <EmptyState title="עדיין לא נארזו אריזות מהחדר הזה" />
      ) : (
        <ul className="flex flex-col gap-2">
          {boxes.data.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-card border border-subtle p-3"
            >
              <span>
                {/* A column of codes: tabular-nums so the digits line up. */}
                <span className="block font-bold tabular-nums">{b.code ?? '—'}</span>
                <span className="block text-sm text-ink-muted">
                  {PACKING_UNIT_TYPE_LABELS[b.type]} · יעד {b.destRoom ?? '—'}
                </span>
              </span>
              <StatusChip entityType="packing_unit" status={b.status} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 7: Write `src/components/command/RoomsGrid.tsx`**

```tsx
'use client';

import { Card, EmptyState, StatusChip } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { progressPercent, roomsByGroup } from './logic';
import { Meter } from './Meter';

export function RoomsGrid({
  rooms,
  onOpen,
}: {
  rooms: DashboardDTO['rooms'];
  onOpen: (room: DashboardDTO['rooms'][number]) => void;
}) {
  if (rooms.length === 0) {
    return <EmptyState title="אין עדיין חדרים במערכת" body="חדרים שמופו בשלב א׳ יופיעו כאן." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {roomsByGroup(rooms).map((group) => (
        <section key={group.groupName}>
          <h2 className="mb-2 font-bold text-white">{group.groupName}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.rooms.map((room) => (
              <button key={room.id} type="button" onClick={() => onOpen(room)} className="text-right">
                <Card className="h-full transition hover:border-primary">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">{room.description}</p>
                    <StatusChip entityType="room" status={room.status} />
                  </div>
                  <p className="mt-2 mb-2 text-sm text-ink-muted">
                    נארזו {room.packedQty} מתוך {room.mappedQty} פריטים ·{' '}
                    {progressPercent(room.packedQty, room.mappedQty)}%
                  </p>
                  <Meter
                    value={room.packedQty}
                    max={room.mappedQty}
                    label={`התקדמות אריזה ב${room.description}`}
                  />
                </Card>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Render the grid from `CommandDashboard.tsx`**

Add the imports:

```tsx
import { useState } from 'react';
import type { DashboardDTO } from '@/lib/contracts';
import { RoomBoxes } from './RoomBoxes';
import { RoomsGrid } from './RoomsGrid';
```

Add the drill-down state beside the existing `now` state:

```tsx
const [openRoom, setOpenRoom] = useState<DashboardDTO['rooms'][number] | null>(null);
```

And render the grid and the dialog immediately after `<KpiTiles kpis={data.kpis} />`:

```tsx
      <RoomsGrid rooms={data.rooms} onOpen={setOpenRoom} />

      {openRoom && (
        <RoomBoxes
          roomId={openRoom.id}
          roomName={openRoom.description}
          onClose={() => setOpenRoom(null)}
        />
      )}
```

- [ ] **Step 9: Look at it**

```bash
npm run demo:reset
npm run dev
```

At `/command`: two group headings, four room cards with their status chips and empty meters. Pack something out of room 101 and watch its meter fill within three seconds. Click the card → the dialog lists the boxes with their codes and status chips.

Check the RTL detail that silently breaks: the meter must fill **from the right**. If it fills from the left, something added a `dir` or a `flex-row-reverse` around it — fix that rather than the `Meter` component.

Then check room 103 (`ממתין למיפוי`, nothing mapped): the card shows `נארזו 0 מתוך 0 פריטים · 0%` with an empty meter, not `NaN%`.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/components/command tests/command
git commit -m "feat(command): rooms grid with progress meters and drill-down"
```

---

### Task 7: The trucks panel, the exceptions panel and the SMS feed

The three side panels. Review Focus 1 and 2 close out here.

**Files:**
- Create: `src/components/command/TrucksPanel.tsx`, `src/components/command/ExceptionsPanel.tsx`, `src/components/command/SmsFeed.tsx`
- Modify: `src/components/command/CommandDashboard.tsx` (two-column layout), `src/components/command/logic.ts` (append), `tests/command/ui-logic.test.ts` (append)

**Interfaces:**
- Consumes: `formatHeDateTime` from Task 5; `Card`, `EmptyState`, `StatusChip` from `@/components/ui`; `TRANSPORT_TYPE_LABELS` from `@/lib/labels`.
- Produces:
  - `exceptionBadge(kind: 'missing_box' | 'short_item'): { glyph: string; label: string; tone: 'danger' | 'warn' }`
  - `<TrucksPanel trucks />`, `<ExceptionsPanel exceptions />`, `<SmsFeed notifications />`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/command-panels
```

- [ ] **Step 2: Append the failing test to `tests/command/ui-logic.test.ts`**

```ts
import { exceptionBadge } from '@/components/command/logic';

describe('exceptionBadge', () => {
  it('names a missing box in Hebrew', () => {
    expect(exceptionBadge('missing_box')).toEqual({ glyph: '✕', label: 'אריזה חסרה', tone: 'danger' });
  });

  it('names a short item in Hebrew', () => {
    expect(exceptionBadge('short_item')).toEqual({ glyph: '!', label: 'פריט בחוסר', tone: 'warn' });
  });

  /**
   * Review Focus 1: danger #C62828 and warn #B26A00 measure ΔE 13.3 apart with full
   * colour vision — below the threshold at which a reader can tell them apart. The
   * two kinds of loss must never be distinguished by tone alone.
   */
  it('separates the two kinds of loss by glyph and by label, not only by tone', () => {
    const missing = exceptionBadge('missing_box');
    const short = exceptionBadge('short_item');
    expect(missing.glyph).not.toBe(short.glyph);
    expect(missing.label).not.toBe(short.label);
    expect(missing.tone).not.toBe(short.tone);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: FAIL — `exceptionBadge` is not exported yet.

- [ ] **Step 4: Append to `src/components/command/logic.ts`**

```ts
/**
 * How a loss is marked. Glyph first, then a Hebrew label, then a tone — in that
 * order of importance, because the two tones are close enough to be confused even
 * by a reader with full colour vision (ΔE 13.3) and identical under protanopia.
 */
export function exceptionBadge(kind: 'missing_box' | 'short_item'): {
  glyph: string;
  label: string;
  tone: 'danger' | 'warn';
} {
  return kind === 'missing_box'
    ? { glyph: '✕', label: 'אריזה חסרה', tone: 'danger' }
    : { glyph: '!', label: 'פריט בחוסר', tone: 'warn' };
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/command/TrucksPanel.tsx`**

```tsx
import { Card, EmptyState, StatusChip } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { formatHeDateTime } from './format';

export function TrucksPanel({ trucks }: { trucks: DashboardDTO['trucks'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">יחידות הובלה</h2>
      {trucks.length === 0 ? (
        <EmptyState title="אין עדיין יחידות הובלה" body="יחידת הובלה שתיפתח תופיע כאן." />
      ) : (
        <ul className="flex flex-col gap-2">
          {trucks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 border-b border-subtle pb-2 last:border-0">
              <span>
                {/* A column of plates and counts: tabular-nums keeps them aligned. */}
                <span className="block font-bold tabular-nums">{t.licensePlate}</span>
                <span className="block text-sm text-ink-muted">
                  {TRANSPORT_TYPE_LABELS[t.type]} · {t.boxCount} אריזות · יציאה{' '}
                  {formatHeDateTime(t.departedAt)}
                </span>
              </span>
              <StatusChip entityType="transport_unit" status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Write `src/components/command/ExceptionsPanel.tsx`**

```tsx
import { Card, EmptyState } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';
import { exceptionBadge } from './logic';

const TONE: Record<'danger' | 'warn', string> = {
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
};

export function ExceptionsPanel({ exceptions }: { exceptions: DashboardDTO['exceptions'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">חריגים</h2>
      {exceptions.length === 0 ? (
        <EmptyState title="אין חריגים" body="כל הציוד שנארז הגיע ופוזר." />
      ) : (
        <ul className="flex flex-col gap-3">
          {exceptions.map((e, index) => {
            const badge = exceptionBadge(e.kind);
            return (
              <li key={`${e.kind}-${e.packingUnitId}-${index}`} className="border-b border-subtle pb-3 last:border-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${TONE[badge.tone]}`}>
                  <span aria-hidden>{badge.glyph}</span>
                  {badge.label}
                </span>
                <p className="mt-1 font-medium">{e.description}</p>
                <p className="text-sm text-ink-muted">
                  {e.lastActorName} · {formatHeDateTime(e.at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

The key includes the index because one box can produce several `short_item` rows, so `packingUnitId` alone is not unique.

- [ ] **Step 8: Write `src/components/command/SmsFeed.tsx`**

```tsx
import { Card, EmptyState } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';

/** The mocked SMS outbox (spec §1: written to a table, never actually sent). */
export function SmsFeed({ notifications }: { notifications: DashboardDTO['notifications'] }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">הודעות שנשלחו</h2>
      {notifications.length === 0 ? (
        <EmptyState title="לא נשלחו עדיין הודעות" />
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => (
            <li key={n.id} className="border-b border-subtle pb-3 last:border-0">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {n.recipients} · {formatHeDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 9: Replace `src/components/command/CommandDashboard.tsx` entirely**

This is the third task to touch the file, so here it is whole. Only the imports, the two-column block and the three panels are new; the polling, the freshness clock and the drill-down are as Tasks 5 and 6 left them.

```tsx
'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Banner, describeError, Spinner } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { DashboardDTO } from '@/lib/contracts';
import { ExceptionsPanel } from './ExceptionsPanel';
import { HeroProgress, KpiTiles } from './KpiTiles';
import { freshnessLabel } from './logic';
import { RoomBoxes } from './RoomBoxes';
import { RoomsGrid } from './RoomsGrid';
import { SmsFeed } from './SmsFeed';
import { TrucksPanel } from './TrucksPanel';

/** Spec §1: poll every 3 seconds. No WebSockets. */
const POLL_MS = 3000;

export function CommandDashboard() {
  const { data, error } = useSWR('dashboard', api.dashboard, {
    refreshInterval: POLL_MS,
    keepPreviousData: true,
  });

  const [openRoom, setOpenRoom] = useState<DashboardDTO['rooms'][number] | null>(null);

  // Re-render once a second so the freshness line counts up between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Only a dashboard that has never loaded shows an error instead of content.
  if (error && !data) return <Banner tone="danger">{describeError(error).messageHe}</Banner>;
  if (!data) return <Spinner label="טוען תמונת מצב…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-white/80">{freshnessLabel(data.generatedAt, now)}</p>
        {/* A failed poll leaves the last good numbers up, with a note. */}
        {error && <p className="text-sm text-white">אין תקשורת עם השרת — המספרים אינם מתעדכנים</p>}
      </div>

      <HeroProgress kpis={data.kpis} />
      <KpiTiles kpis={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RoomsGrid rooms={data.rooms} onOpen={setOpenRoom} />
        </div>
        {/* Exceptions above trucks on purpose: the inspector persona opens this
            screen to find gaps, not to admire progress. */}
        <div className="flex flex-col gap-4">
          <ExceptionsPanel exceptions={data.exceptions} />
          <TrucksPanel trucks={data.trucks} />
          <SmsFeed notifications={data.notifications} />
        </div>
      </div>

      {openRoom && (
        <RoomBoxes
          roomId={openRoom.id}
          roomName={openRoom.description}
          onClose={() => setOpenRoom(null)}
        />
      )}
    </div>
  );
}
```

Task 8 adds one more line to this file — the box search, above the hero.

- [ ] **Step 10: Look at it**

```bash
npm run demo:reset
npm run dev
```

At `/command`, first with an empty database: all three panels show their Hebrew empty states, none of them is a blank box. Then run a box through load and receive (P4's screens, or `npx prisma studio`) so a truck, a missing box and two SMS rows exist. Expected within three seconds: the truck row with its plate and departure time, a red `✕ אריזה חסרה` exception naming the code and the unloader, and the SMS feed newest first.

Now the check the validator prompted: squint, or open the page in a grayscale filter (macOS: System Settings → Accessibility → Display → Color Filters → Grayscale; Chrome DevTools: Rendering → Emulate vision deficiencies → protanopia). The missing and short rows must still be tellable apart — the `✕` and the `!` and their labels carry it once the colour is gone.

- [ ] **Step 11: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/components/command tests/command
git commit -m "feat(command): trucks, exceptions and SMS panels"
```

---

### Task 8: Box search and the timeline view

Demo step 5: the commander types the missing box's code and gets its whole history. Review Focus 5 closes here.

**Files:**
- Create: `src/components/command/BoxSearch.tsx`, `src/components/command/Timeline.tsx`
- Modify: `src/components/command/CommandDashboard.tsx` (render the search), `src/components/command/logic.ts` (append), `tests/command/ui-logic.test.ts` (append)

**Interfaces:**
- Consumes: `api.packingUnitByCode(code)`, `api.timeline(packingUnitId)`; `Banner`, `Button`, `Card`, `Dialog`, `EmptyState`, `Spinner`, `StatusChip`, `TextField`, `describeError` from `@/components/ui`; `formatHeDateTime` from Task 5.
- Produces:
  - `parseSearchCode(raw: string): string | null`
  - `<BoxSearch />`, `<Timeline events />`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b p5/box-search
```

- [ ] **Step 2: Append the failing test to `tests/command/ui-logic.test.ts`**

```ts
import { parseSearchCode } from '@/components/command/logic';

describe('parseSearchCode', () => {
  it('accepts a bare five-digit code', () => {
    expect(parseSearchCode('10001')).toBe('10001');
  });

  it('tolerates the spaces a commander types or pastes', () => {
    expect(parseSearchCode('  10001 ')).toBe('10001');
  });

  // Review Focus 5: a search box is the one field anyone types anything into.
  it('refuses anything that is not exactly five digits', () => {
    expect(parseSearchCode('1234')).toBeNull();
    expect(parseSearchCode('123456')).toBeNull();
    expect(parseSearchCode('')).toBeNull();
    expect(parseSearchCode('   ')).toBeNull();
    expect(parseSearchCode('מחשב')).toBeNull();
    expect(parseSearchCode('1000a')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: FAIL — `parseSearchCode` is not exported yet.

- [ ] **Step 4: Append to `src/components/command/logic.ts`**

```ts
/**
 * A typed box code, or null. Deliberately stricter than the field scanner's
 * normalizer: a commander types this by hand from a printed label, so a five-digit
 * string is the only thing worth sending to the server.
 */
export function parseSearchCode(raw: string): string | null {
  const trimmed = raw.trim();
  return /^\d{5}$/.test(trimmed) ? trimmed : null;
}
```

- [ ] **Step 5: Run the test**

```bash
npm test -- tests/command/ui-logic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write `src/components/command/Timeline.tsx`**

```tsx
import { EmptyState } from '@/components/ui';
import type { TimelineEventDTO } from '@/lib/contracts';
import { formatHeDateTime } from './format';

export function Timeline({ events }: { events: TimelineEventDTO[] }) {
  if (events.length === 0) {
    return <EmptyState title="אין עדיין אירועים לאריזה הזו" />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 border-b border-subtle pb-3 last:border-0">
          {/* A column of times: tabular-nums so they line up down the page. */}
          <span className="shrink-0 pt-0.5 text-sm text-ink-muted tabular-nums">
            {formatHeDateTime(e.at)}
          </span>
          <span>
            <span className="block font-medium">{e.label}</span>
            <span className="block text-sm text-ink-muted">
              {e.actorName}
              {e.note && ` · ${e.note}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 7: Write `src/components/command/BoxSearch.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Banner, Button, Card, describeError, Dialog, Spinner, StatusChip, TextField } from '@/components/ui';
import { api } from '@/lib/api/client';
import type { PackingUnitDTO, TimelineEventDTO } from '@/lib/contracts';
import { PACKING_UNIT_TYPE_LABELS } from '@/lib/labels';
import { parseSearchCode } from './logic';
import { Timeline } from './Timeline';

export function BoxSearch() {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ unit: PackingUnitDTO; events: TimelineEventDTO[] } | null>(null);

  async function search() {
    const code = parseSearchCode(typed);
    if (!code) {
      setError('יש להזין מספר אריזה בן 5 ספרות');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const unit = await api.packingUnitByCode(code);
      const events = await api.timeline(unit.id);
      setFound({ unit, events });
    } catch (e) {
      // A code that was never issued answers 404 NOT_FOUND with a Hebrew message.
      setError(describeError(e).messageHe);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-bold">חיפוש אריזה</h2>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextField
            label="מספר אריזה"
            value={typed}
            onChange={(v) => {
              setTyped(v);
              setError(null);
            }}
            inputMode="numeric"
            maxLength={5}
          />
        </div>
        {/* The kit's Button is full-width by design, so the width lives on a wrapper. */}
        <div className="w-40">
          <Button size="md" onClick={() => void search()} busy={busy}>
            חיפוש
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      {found && (
        <Dialog open title={`אריזה ${found.unit.code ?? '—'}`} onClose={() => setFound(null)}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <StatusChip entityType="packing_unit" status={found.unit.status} />
            <span>{PACKING_UNIT_TYPE_LABELS[found.unit.type]}</span>
            <span>· נארז ב{found.unit.sourceRoomName}</span>
            <span>· יעד {found.unit.destRoom ?? '—'}</span>
            <span>· {found.unit.packedByName}</span>
          </div>
          {busy ? <Spinner /> : <Timeline events={found.events} />}
        </Dialog>
      )}
    </Card>
  );
}
```

- [ ] **Step 8: Render the search from `CommandDashboard.tsx`**

Add the import:

```tsx
import { BoxSearch } from './BoxSearch';
```

and render it directly above `<HeroProgress ... />`, so it is the first thing a commander reaches for:

```tsx
      <BoxSearch />
```

- [ ] **Step 9: Walk the search**

```bash
npm run demo:reset
npm run dev
```

Run a box all the way through pack → load → receive so it has a history, then at `/command`:

1. Type `1234` → `יש להזין מספר אריזה בן 5 ספרות`, no request sent.
2. Type `99999` → the Hebrew `לא נמצא` message from the server, and the field stays usable.
3. Type the real code → the dialog opens with the status chip, the destination and the packer, and a timeline reading `אריזה 10001: אריזה נסגרה` → `פריט "מחשב נייד": פריט נארז` → `יחידת הובלה 12-345-67: יחידת הובלה בדרך` → `אריזה 10001: אריזה התקבלה`, oldest first, each with its actor.

- [ ] **Step 10: Run the suite, build, commit**

```bash
npm test
npm run build
git add src/components/command tests/command
git commit -m "feat(command): box search and the event timeline"
```

---

### Task 9: Integration — the commander's half of the demo (H5 → H20)

P5 owns the screen the whole demo cuts back to, plus its closing beat (`docs/generated/plan.md` §7 step 5).

**Files:** `docs/generated/notes.md` (append — P1 owns the file; append a `## P5` section rather than restructuring it).

- [ ] **Step 1: Watch the whole chain land on the dashboard, live**

Reset the deployed database, put `/command` on a laptop, and have the other four run their legs on phones. Do not touch the laptop. Expected, each within three seconds and with no reload:

1. **Pack** two boxes in room 101 → room 101's meter fills, then its chip flips to `חדר סגור`; `ארוז וממתין` climbs; `boxCounts.closed` is 2.
2. **Load** both onto `12-345-67` → the truck row appears as `יחידת הובלה בדרך` with 2 boxes and a departure time; `בדרך` takes over from `ארוז וממתין`; one SMS row.
3. **Receive** only one → a red `✕ אריזה חסרה` exception naming the code and the unloader; `חסר` goes non-zero; a second SMS naming the missing code.
4. **Distribute** the received box one item short → an amber `! פריט בחוסר` exception; `פוזר` and `בחוסר` both move; a third SMS.
5. **Search** the missing box's code → the full timeline, ending at `אריזה חסרה`.

Step 5 is the demo's closing line. Rehearse it until the dialog opens first time.

- [ ] **Step 2: Check the numbers against reality, by hand**

The one failure this screen cannot survive is being wrong. Mid-demo, stop and check:

```bash
npx prisma studio
```

Add up `packing_unit_items.quantity` by hand and confirm `packed + inTransit + received + distributed + missing + short` equals it exactly (Conventions #2), and that `totalMapped` is 14 on the seeded database. If they disagree, the bug is in `tallyKpis` or in the query feeding it — Task 1's tests pin the tally, so start with the query.

- [ ] **Step 3: Leave it running**

This page polls every 3 seconds for the whole operation. Leave it open for at least an hour of the build and then check: memory has not climbed, the freshness line still says `עודכן עכשיו`, and the SMS feed has not grown past its cap. Kill the server for thirty seconds mid-session — the numbers must stay on screen with the connection note, then recover on their own.

- [ ] **Step 4: Read every Hebrew string out loud**

Every panel, every empty state, every status chip. The chips come from `labels.ts`, so if one reads wrong the fix belongs to P1, not here — say so in chat rather than hard-coding a string.

- [ ] **Step 5: Check it on the projector, not the laptop**

The demo is shown on whatever screen the room has. Look at it from the back of the room: the hero percentage and the two loss tiles must be readable from there, and the grayscale check from Task 7 must still hold under a washed-out projector.

- [ ] **Step 6: Append what you learned to `docs/generated/notes.md`**

```markdown
## P5 — commander dashboard

- `GET /api/dashboard` is one query set per request, polled every 3s. KPIs count item quantities; `boxCounts` counts cartons.
- The six KPI buckets partition the packed universe exactly; a `short` item splits between `distributed` and `short`.
- `totalMapped` counts transfer + salvage only — a disposal item is never packed.
- Loss states carry a glyph and a label, never a colour alone: warn and ok are indistinguishable under protanopia in this palette.
- A failed poll keeps the last good numbers on screen.
- Known shortcut: the read models aggregate in JS, and `src/components/command/format.ts` is a twin of P4's `src/app/field/format.ts`.
- <anything else the rehearsals turned up>
```

- [ ] **Step 7: Commit**

```bash
git add docs/generated/notes.md
git commit -m "docs: P5 integration notes"
```

---

## What P5 does not build

- **Any field screen.** P3 builds pack, P4 builds load/receive/distribute. The dashboard reads what they produce.
- **Any status change.** Everything here is a read. If a number looks wrong, the bug is in this plan's read models or in P2's lifecycle — never fix it by writing a row.
- **New charts.** This screen is stat tiles and meters, which is the right form for a handful of headline numbers. If someone later adds a real chart with two or more series, they must run the palette validator on its categorical colours before shipping it — the four colours already on this screen do not pass a categorical check, which is exactly why none of them is used to tell series apart.
- **Changes to `contracts.ts`, `labels.ts`, `errors.ts`, `api/client.ts` or the Prisma schema.** P1 owns them and they are frozen. `DashboardDTO` and `TimelineEventDTO` in particular are what three other people code against.
