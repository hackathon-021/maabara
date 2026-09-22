# P2 — Lifecycle Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/lifecycle` — the only code in the system allowed to change a status — plus every write endpoint of the evacuation chain (pack → load → receive → distribute), with unit tests that prove zero equipment loss.

**Architecture:** One module per stage under `src/lib/lifecycle/`, all sharing three primitives: a transition table (`transitions.ts`), an append-only event/notification recorder (`events.ts`), and DTO mappers (`dto.ts`). Every action is a single `db.$transaction` that (a) asserts the transition, (b) updates rows, (c) writes a `status_events` row per change, (d) optionally writes a mocked SMS row, and (e) returns a fresh DTO. Route handlers under `src/app/api/**` are three lines each: `handle(...)` → `requireActor()` → zod parse → lifecycle call.

**Tech Stack:** TypeScript, Prisma 6 + PostgreSQL, zod, Vitest 3, Next.js 15 App Router route handlers.

**Spec:** `docs/generated/2026-09-22-mvp-design.md` (§3 data model, §4 lifecycle, §5 flows/API, §7 errors, §8 testing).
**Master plan (frozen contracts you import, never redefine):** `docs/generated/plan.md` §5.

## Global Constraints

See `docs/generated/plan.md` → Global Constraints. The ones that bite this workstream:

- Only `src/lib/lifecycle/**` may write `status` columns, `status_events` or `notifications`. You own that rule — do not let a route handler write a status directly.
- Every status change writes a `status_events` row **in the same transaction** as the update.
- API errors are always `{ error: ErrorCode, messageHe: string }` — always thrown as an `AppError` from `src/lib/errors.ts`, never a bare `Error`, never a hand-built `Response`.
- Box codes are exactly 5 digits (`/^\d{5}$/`), unique, assigned by the server on close.
- Code, identifiers and comments in English. Every user-facing string (`messageHe`, SMS bodies, event notes) in Hebrew.
- Never edit a file you don't own (`docs/generated/plan.md` §4). The frozen files (`contracts.ts`, `labels.ts`, `errors.ts`, `api/respond.ts`, `api/client.ts`, `prisma/schema.prisma`) belong to P1 — if you think one needs a change, ask in team chat, don't patch it.
- Hackathon MVP: mark every shortcut with `// TODO:` and a reason.

## Conventions this plan commits to

Three decisions the rest of the plan depends on. Read them before Task 1.

1. **Actions take the actor as their first argument.** Every lifecycle function is `(actor: Actor, ...)`. Nothing under `src/lib/lifecycle/**` calls `requireActor()` — the route handler does that and passes the result down. This is what makes the lifecycle testable without a session.
2. **Tests target lifecycle functions, not route handlers.** Route handlers import `@/lib/session`, which imports Auth.js — awkward to load in a Vitest node environment. Spec §8 asks for unit tests on `lib/lifecycle`, so that is where every test lives. Each route gets a manual `curl` smoke check instead, with `AUTH_BYPASS=1` in `.env`.
3. **Item `packed` events are written at close, not at item selection.** `PUT /items` replaces the whole contents of an open box, so writing item events there would fill the audit trail with churn the packer is still editing. Rows are created with the schema default `item_status = 'packed'`; their `null → packed` event is written when the box closes, which is also the moment the packing flow calls "פריט נארז". Every later item transition writes its event at the moment it happens.

## Review Focus

Input classes the spec implies but the happy-path tests never reach. Each one has a test in the task that owns the code.

1. **The same box code scanned twice into one load** (`codes: ['10001','10001']`) — the client accumulates raw scans, so duplicates arrive. Must load the box once, not fail on a repeated update or count it twice in the SMS. → Task 5.
2. **`PUT /items` called twice on the same open box** — the packer edits the contents. The second call must measure remaining *excluding this box's own current rows*, or the packer gets a false "exceeds remaining" on their own quantities. → Task 3.
3. **A code listed in both `receivedCodes` and `surplusCodes`, or listed twice** — the receive screen builds two lists from one scan stream. Each box must be processed exactly once, and a code the unloader marked surplus that turns out to *be* on the truck is a normal receive, not an error. → Task 6.
4. **Distribute with every quantity 0 (or an empty `items` array) on a non-personal box** — nothing was actually handed over. The box must end `distributed_short` with every item `short` and an SMS, never `distributed`. Silently marking it distributed would lose the equipment. → Task 7.
5. **A box code that does not exist, or arrives with whitespace / `CHAR(5)` padding** — `by-code` is on the scanner's hot path. Must answer `404 NOT_FOUND` with a Hebrew message, never a 500 and never a silent miss. → Task 2.

---

### Task 1: Transition table, event recorder, DTO mappers

The foundation every later task imports. Nothing here touches a domain flow.

**Files:**
- Create: `src/lib/lifecycle/transitions.ts`, `src/lib/lifecycle/events.ts`, `src/lib/lifecycle/dto.ts`
- Test: `tests/lifecycle/transitions.test.ts`, `tests/lifecycle/events.test.ts`

**Interfaces:**
- Consumes (from P1, Checkpoint A): `db`, `type Tx` from `@/lib/db`; `Errors`, `AppError` from `@/lib/errors`; `statusLabel`, `PACKING_UNIT_STATUS_LABELS`, `ROOM_STATUS_LABELS` from `@/lib/labels`; every type and constant from `@/lib/contracts`; `resetDb`, `seedFixture`, `type Fixture` from `tests/helpers/db`.
- Produces:
  - `assertTransition(entityType: EntityType, from: string | null, to: string): void`
  - `TRANSPORT_UNLOADED: 'unloaded'`, `PACKING_UNIT_TRANSITIONS`, `ITEM_TRANSITIONS`, `TRANSPORT_TRANSITIONS`, `ROOM_TRANSITIONS`
  - `recordEvent(tx: Tx, e: EventInput): Promise<unknown>`, `notify(tx: Tx, n: NotifyInput): Promise<unknown>`, `formatHe(at: Date): string`, `DEFAULT_RECIPIENTS: string`
  - `PACKING_UNIT_INCLUDE`, `PACKING_UNIT_SUMMARY_INCLUDE`, `TRANSPORT_UNIT_INCLUDE`; row types `PackingUnitRow`, `PackingUnitSummaryRow`, `TransportUnitRow`; `toPackingUnitDTO`, `toPackingUnitSummaryDTO`, `toTransportUnitDTO`, `normalizeCode(code: string): string`

- [ ] **Step 1: Branch**

From the repository root (wherever you cloned it — never hard-code a personal path into a command you share):

```bash
git checkout main && git pull && git checkout -b p2/lifecycle-core
```

- [ ] **Step 2: Write the failing test** — `tests/lifecycle/transitions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { assertTransition, TRANSPORT_UNLOADED } from '@/lib/lifecycle/transitions';

describe('assertTransition', () => {
  it('allows every legal packing-unit step of the chain', () => {
    expect(() => assertTransition('packing_unit', 'open', 'closed')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'closed', 'in_transit')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'in_transit', 'received')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'in_transit', 'missing')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'received', 'distributed')).not.toThrow();
    expect(() => assertTransition('packing_unit', 'received', 'distributed_short')).not.toThrow();
  });

  it('treats a null from-status as creation', () => {
    expect(() => assertTransition('packing_unit', null, 'open')).not.toThrow();
    expect(() => assertTransition('packing_unit_item', null, 'packed')).not.toThrow();
  });

  it('rejects skipping a step, with both Hebrew labels in the message', () => {
    try {
      assertTransition('packing_unit', 'open', 'received');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('ILLEGAL_TRANSITION');
      expect(err.status).toBe(409);
      expect(err.messageHe).toContain('אריזה בתהליך');
      expect(err.messageHe).toContain('אריזה התקבלה');
    }
  });

  it('rejects re-applying the same status', () => {
    expect(() => assertTransition('packing_unit', 'in_transit', 'in_transit')).toThrow(AppError);
  });

  it('rejects leaving a terminal status', () => {
    expect(() => assertTransition('packing_unit', 'missing', 'received')).toThrow(AppError);
    expect(() => assertTransition('packing_unit', 'distributed', 'received')).toThrow(AppError);
    expect(() => assertTransition('packing_unit_item', 'short', 'distributed')).toThrow(AppError);
  });

  it('routes a transport unit through the unloaded pseudo-status', () => {
    expect(() => assertTransition('transport_unit', 'loading', 'in_transit')).not.toThrow();
    expect(() => assertTransition('transport_unit', 'in_transit', TRANSPORT_UNLOADED)).not.toThrow();
    expect(() => assertTransition('transport_unit', TRANSPORT_UNLOADED, 'released')).not.toThrow();
    expect(() => assertTransition('transport_unit', 'in_transit', 'released')).toThrow(AppError);
  });

  it('knows the room closing steps', () => {
    expect(() => assertTransition('room', 'done', 'packing')).not.toThrow();
    expect(() => assertTransition('room', 'packing', 'closed')).not.toThrow();
    expect(() => assertTransition('room', 'packing', 'awaiting_disposal')).not.toThrow();
    expect(() => assertTransition('room', 'waiting', 'packing')).toThrow(AppError);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/lifecycle/transitions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lifecycle/transitions'`.

- [ ] **Step 4: Implement `src/lib/lifecycle/transitions.ts`**

```ts
import type { EntityType, ItemStatus, PackingUnitStatus, RoomStatus } from '@/lib/contracts';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

/**
 * 'unloaded' (יחידת הובלה נפרקה במלואה) is a transport pseudo-status: the receive action writes
 * it as an event but never stores it on the row, which goes straight from in_transit to released.
 */
export const TRANSPORT_UNLOADED = 'unloaded';

export const PACKING_UNIT_TRANSITIONS: Record<PackingUnitStatus, readonly PackingUnitStatus[]> = {
  open: ['closed'],
  closed: ['in_transit'],
  in_transit: ['received', 'missing'],
  received: ['distributed', 'distributed_short'],
  missing: [],
  distributed: [],
  distributed_short: [],
};

export const ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  packed: ['received', 'missing'],
  received: ['distributed', 'short'],
  missing: [],
  distributed: [],
  short: [],
};

export const TRANSPORT_TRANSITIONS: Record<string, readonly string[]> = {
  loading: ['in_transit'],
  in_transit: [TRANSPORT_UNLOADED],
  [TRANSPORT_UNLOADED]: ['released'],
  released: [],
};

// TODO: waiting/inProgress/done belong to Phase A mapping; listed so a stale room can't be packed.
export const ROOM_TRANSITIONS: Record<RoomStatus, readonly RoomStatus[]> = {
  waiting: ['inProgress'],
  inProgress: ['done'],
  done: ['packing'],
  packing: ['closed', 'awaiting_disposal'],
  awaiting_disposal: ['closed'],
  closed: [],
};

const TABLES: Record<EntityType, Record<string, readonly string[]>> = {
  packing_unit: PACKING_UNIT_TRANSITIONS,
  packing_unit_item: ITEM_TRANSITIONS,
  transport_unit: TRANSPORT_TRANSITIONS,
  room: ROOM_TRANSITIONS,
};

/**
 * Throws ILLEGAL_TRANSITION unless `from` → `to` is listed for this entity type.
 * `from === null` means the row is being created, which is always allowed.
 */
export function assertTransition(entityType: EntityType, from: string | null, to: string): void {
  if (from === null) return;
  if (!TABLES[entityType][from]?.includes(to)) {
    throw Errors.illegalTransition(statusLabel(entityType, from), statusLabel(entityType, to));
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/transitions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing test for the recorder** — `tests/lifecycle/events.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { DEFAULT_RECIPIENTS, formatHe, notify, recordEvent } from '@/lib/lifecycle/events';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('events', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('records an event inside the caller transaction', async () => {
    await db.$transaction(async (tx) => {
      await recordEvent(tx, {
        entityType: 'room',
        entityId: fx.roomA,
        fromStatus: 'done',
        toStatus: 'packing',
        actorId: fx.userId,
        note: 'בדיקה',
      });
    });
    const events = await db.statusEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'room',
      entityId: fx.roomA,
      fromStatus: 'done',
      toStatus: 'packing',
      actorId: fx.userId,
      note: 'בדיקה',
    });
  });

  it('rolls the event back when the caller transaction fails', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await recordEvent(tx, {
          entityType: 'room', entityId: fx.roomA, fromStatus: null, toStatus: 'packing', actorId: fx.userId,
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.statusEvent.count()).toBe(0);
  });

  it('writes a mocked SMS row with the default distribution list', async () => {
    await db.$transaction((tx) =>
      notify(tx, { body: 'יחידת הובלה הועמסה', entityType: 'transport_unit', entityId: 7 }),
    );
    const [sms] = await db.notification.findMany();
    expect(sms).toMatchObject({ channel: 'sms', recipients: DEFAULT_RECIPIENTS, body: 'יחידת הובלה הועמסה' });
  });

  it('formats a timestamp in Israel time for SMS bodies', () => {
    // 09:05 UTC in September is 12:05 in Jerusalem (UTC+3).
    expect(formatHe(new Date('2026-09-22T09:05:00Z'))).toContain('12:05');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run tests/lifecycle/events.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lifecycle/events'`.

- [ ] **Step 8: Implement `src/lib/lifecycle/events.ts`**

```ts
import type { EntityType } from '@/lib/contracts';
import type { Tx } from '@/lib/db';

/** Mocked distribution list — spec §1: SMS is written to a table, never really sent. */
export const DEFAULT_RECIPIENTS = 'רשימת תפוצה — מבצע המעבר דרומה';

export interface EventInput {
  entityType: EntityType;
  entityId: number;
  /** null means the row is being created. */
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  note?: string;
}

export interface NotifyInput {
  body: string;
  entityType: EntityType;
  entityId: number;
}

/** Appends one audit row. Always called with the same `tx` as the update it describes. */
export function recordEvent(tx: Tx, e: EventInput) {
  return tx.statusEvent.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorId: e.actorId,
      note: e.note ?? null,
    },
  });
}

/** Queues a mocked SMS; the commander dashboard reads these as a feed. */
export function notify(tx: Tx, n: NotifyInput) {
  return tx.notification.create({
    data: {
      channel: 'sms',
      recipients: DEFAULT_RECIPIENTS,
      body: n.body,
      entityType: n.entityType,
      entityId: n.entityId,
    },
  });
}

/** Israel-local date and time, for SMS bodies. */
export function formatHe(at: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Implement `src/lib/lifecycle/dto.ts`**

No test of its own — every later task's tests assert on DTOs this file produces.

```ts
import type { Prisma } from '@prisma/client';
import type {
  ItemStatus, PackingUnitDTO, PackingUnitItemDTO, PackingUnitStatus, PackingUnitSummaryDTO,
  PackingUnitType, TransportStatus, TransportType, TransportUnitDTO,
} from '@/lib/contracts';

export const PACKING_UNIT_SUMMARY_INCLUDE = { sourceRoom: true } satisfies Prisma.PackingUnitInclude;

export const PACKING_UNIT_INCLUDE = {
  sourceRoom: { include: { group: true } },
  packedBy: true,
  items: { include: { mappingReport: { include: { subCategory: true } } } },
} satisfies Prisma.PackingUnitInclude;

export const TRANSPORT_UNIT_INCLUDE = {
  packingUnits: { include: PACKING_UNIT_SUMMARY_INCLUDE },
} satisfies Prisma.TransportUnitInclude;

export type PackingUnitSummaryRow = Prisma.PackingUnitGetPayload<{ include: typeof PACKING_UNIT_SUMMARY_INCLUDE }>;
export type PackingUnitRow = Prisma.PackingUnitGetPayload<{ include: typeof PACKING_UNIT_INCLUDE }>;
export type TransportUnitRow = Prisma.TransportUnitGetPayload<{ include: typeof TRANSPORT_UNIT_INCLUDE }>;

/** Postgres CHAR(5) pads on read and scanners add whitespace. Codes are compared normalized. */
export function normalizeCode(code: string): string {
  return code.trim();
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'he');

export function toPackingUnitSummaryDTO(u: PackingUnitSummaryRow): PackingUnitSummaryDTO {
  return {
    id: u.id,
    code: u.code === null ? null : normalizeCode(u.code),
    type: u.type as PackingUnitType,
    status: u.status as PackingUnitStatus,
    sourceRoomName: u.sourceRoom.description,
    destBuilding: u.destBuilding,
    destFloor: u.destFloor,
    destRoom: u.destRoom,
  };
}

export function toPackingUnitDTO(u: PackingUnitRow): PackingUnitDTO {
  const items: PackingUnitItemDTO[] = u.items
    .map((i) => ({
      id: i.id,
      mappingReportId: i.mappingReportId,
      name: i.mappingReport.subCategory.description,
      serial: i.mappingReport.serial,
      quantity: i.quantity,
      distributedQuantity: i.distributedQuantity,
      itemStatus: i.itemStatus as ItemStatus,
    }))
    .sort(byName);

  return {
    ...toPackingUnitSummaryDTO(u),
    sourceRoomId: u.sourceRoomId,
    groupName: u.sourceRoom.group.name,
    roomManager: u.sourceRoom.roomManager,
    transportUnitId: u.transportUnitId,
    packedByName: u.packedBy.name,
    closedAt: u.closedAt?.toISOString() ?? null,
    items,
  };
}

export function toTransportUnitDTO(t: TransportUnitRow): TransportUnitDTO {
  return {
    id: t.id,
    type: t.type as TransportType,
    typeDetails: t.typeDetails,
    licensePlate: t.licensePlate,
    groupId: t.groupId,
    status: t.status as TransportStatus,
    createdAt: t.createdAt.toISOString(),
    departedAt: t.departedAt?.toISOString() ?? null,
    releasedAt: t.releasedAt?.toISOString() ?? null,
    boxes: t.packingUnits
      .map(toPackingUnitSummaryDTO)
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
  };
}
```

- [ ] **Step 11: Type-check and commit**

```bash
npx tsc --noEmit
npx vitest run tests/lifecycle
git add src/lib/lifecycle tests/lifecycle
git commit -m "feat(lifecycle): transition table, event recorder and DTO mappers"
```

Expected: no type errors; 11 tests pass.

---

### Task 2: Read models and the read routes

Everything the field screens need before they can act: what is packable, which boxes exist, which box is this code.

**Files:**
- Create: `src/lib/lifecycle/queries.ts`, `src/lib/lifecycle/index.ts`, `src/lib/api/schemas.ts`, `src/app/api/rooms/[id]/packable-items/route.ts`, `src/app/api/packing-units/route.ts`, `src/app/api/packing-units/by-code/[code]/route.ts`
- Test: `tests/lifecycle/queries.test.ts`

**Interfaces:**
- Consumes: Task 1's `dto.ts`; `PACKABLE_ROOM_STATUSES`, `BOX_CODE_RE` and the DTO types from `@/lib/contracts`; `Errors`; `ROOM_STATUS_LABELS`; `handle` from `@/lib/api/respond`; `requireActor` from `@/lib/session`.
- Produces:
  - `assertRoomPackable(room: { status: string }): void`
  - `packableReports(client: Tx, roomId: number, excludePackingUnitId?: number): Promise<PackableReport[]>` where `PackableReport = { id, name, serial, status, quantity, remaining }`
  - `roomTotals(client: Tx, roomId: number): Promise<{ remaining: number; disposalRemaining: number }>`
  - `listPackableItems(roomId: number): Promise<PackableItemDTO[]>`
  - `listPackingUnits(filter: { status?: PackingUnitStatus; roomId?: number }): Promise<PackingUnitSummaryDTO[]>`
  - `loadPackingUnitDTO(client: Tx, id: number): Promise<PackingUnitDTO>`
  - `getPackingUnit(id: number): Promise<PackingUnitDTO>`
  - `getPackingUnitByCode(code: string): Promise<PackingUnitDTO>`
  - `loadTransportUnitDTO(client: Tx, id: number): Promise<TransportUnitDTO>`
  - `listTransportUnits(status?: TransportStatus): Promise<TransportUnitDTO[]>`
  - `src/lib/api/schemas.ts`: `boxCodeSchema`, `idParamSchema`, `listPackingUnitsQuery`, `transportStatusQuery`, and (unused until Task 3) `oneOf`
  - `src/lib/lifecycle/index.ts` re-exporting every public function — routes and tests import from `@/lib/lifecycle`

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/queries.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getPackingUnitByCode, listPackableItems, listPackingUnits } from '@/lib/lifecycle';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('read models', () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
  });

  it('lists transfer and salvage items of a mapped room, sorted A–Z, with remaining', async () => {
    const items = await listPackableItems(fx.roomA);
    expect(items.map((i) => i.name)).toEqual(['מחשב נייד', 'מסך']);
    expect(items).toEqual([
      { mappingReportId: fx.reports.laptop, name: 'מחשב נייד', serial: null, status: 'transfer', remaining: 2 },
      { mappingReportId: fx.reports.monitor, name: 'מסך', serial: null, status: 'salvage', remaining: 1 },
    ]);
  });

  it('never offers a disposal item', async () => {
    const items = await listPackableItems(fx.roomB);
    expect(items.map((i) => i.mappingReportId)).toEqual([fx.reports.chair]);
  });

  it('subtracts what is already in a box, including a box still open', async () => {
    const unit = await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'open', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    await db.packingUnitItem.create({
      data: { packingUnitId: unit.id, mappingReportId: fx.reports.laptop, quantity: 1 },
    });
    const items = await listPackableItems(fx.roomA);
    expect(items.find((i) => i.mappingReportId === fx.reports.laptop)?.remaining).toBe(1);
  });

  it('drops an item once nothing remains', async () => {
    const unit = await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'open', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    await db.packingUnitItem.create({
      data: { packingUnitId: unit.id, mappingReportId: fx.reports.laptop, quantity: 2 },
    });
    expect((await listPackableItems(fx.roomA)).map((i) => i.name)).toEqual(['מסך']);
  });

  it('refuses a room that is still being mapped', async () => {
    await expect(listPackableItems(fx.roomUnmapped)).rejects.toMatchObject({
      code: 'ROOM_NOT_MAPPED',
      messageHe: 'יש לסיים את המיפוי',
      status: 409,
    });
  });

  it('refuses a room that is already closed', async () => {
    await db.room.update({ where: { id: fx.roomA }, data: { status: 'closed' } });
    await expect(listPackableItems(fx.roomA)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('reports a missing room as NOT_FOUND', async () => {
    await expect(listPackableItems(999_999)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('filters the box list by status and by room', async () => {
    const make = (roomId: number, status: string, code: string) =>
      db.packingUnit.create({
        data: { type: 'professional_carton', status, code, sourceRoomId: roomId, packedById: fx.userId },
      });
    await make(fx.roomA, 'closed', '10001');
    await make(fx.roomA, 'in_transit', '10002');
    await make(fx.roomB, 'closed', '10003');

    expect((await listPackingUnits({ status: 'closed' })).map((u) => u.code)).toEqual(['10001', '10003']);
    expect((await listPackingUnits({ roomId: fx.roomB })).map((u) => u.code)).toEqual(['10003']);
    expect(await listPackingUnits({})).toHaveLength(3);
  });

  it('finds a box by code, tolerating scanner whitespace', async () => {
    await db.packingUnit.create({
      data: { type: 'professional_carton', status: 'closed', code: '10007', sourceRoomId: fx.roomA, packedById: fx.userId },
    });
    const unit = await getPackingUnitByCode(' 10007 ');
    expect(unit.code).toBe('10007');
    expect(unit.sourceRoomName).toBe('חדר A');
    expect(unit.groupName).toBe('מדור בדיקות');
  });

  it('reports an unknown code as NOT_FOUND, not a crash', async () => {
    await expect(getPackingUnitByCode('99999')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lifecycle/queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lifecycle'`.

- [ ] **Step 3: Implement `src/lib/lifecycle/queries.ts`**

```ts
import {
  PACKABLE_ROOM_STATUSES,
  type PackableItemDTO, type PackingUnitDTO, type PackingUnitStatus, type PackingUnitSummaryDTO,
  type RoomStatus, type TransportStatus, type TransportUnitDTO,
} from '@/lib/contracts';
import { db, type Tx } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { ROOM_STATUS_LABELS } from '@/lib/labels';
import {
  PACKING_UNIT_INCLUDE, PACKING_UNIT_SUMMARY_INCLUDE, TRANSPORT_UNIT_INCLUDE,
  normalizeCode, toPackingUnitDTO, toPackingUnitSummaryDTO, toTransportUnitDTO,
} from './dto';

export interface PackableReport {
  id: number;
  name: string;
  serial: string | null;
  status: 'transfer' | 'salvage';
  quantity: number;
  /** quantity minus everything already put into a box. */
  remaining: number;
}

/** A room still being mapped can't be packed; a room already finished can't be reopened. */
export function assertRoomPackable(room: { status: string }): void {
  if (room.status === 'waiting' || room.status === 'inProgress') throw Errors.roomNotMapped();
  if (!(PACKABLE_ROOM_STATUSES as readonly string[]).includes(room.status)) {
    throw Errors.illegalTransition(
      ROOM_STATUS_LABELS[room.status as RoomStatus] ?? room.status,
      ROOM_STATUS_LABELS.packing,
    );
  }
}

/**
 * Every transfer/salvage item of a room with how much is still unpacked.
 * Packed quantity is counted in ANY item status — equipment already in a box (even a missing
 * one) must never be offered for packing again. `excludePackingUnitId` leaves one box's own
 * rows out, which is what PUT /items needs when it replaces its contents.
 */
export async function packableReports(
  client: Tx,
  roomId: number,
  excludePackingUnitId?: number,
): Promise<PackableReport[]> {
  const reports = await client.mappingReport.findMany({
    where: { roomId, isAvailable: true, status: { in: ['transfer', 'salvage'] } },
    include: { subCategory: true },
  });
  if (reports.length === 0) return [];

  const packed = await client.packingUnitItem.groupBy({
    by: ['mappingReportId'],
    where: {
      mappingReportId: { in: reports.map((r) => r.id) },
      ...(excludePackingUnitId === undefined ? {} : { packingUnitId: { not: excludePackingUnitId } }),
    },
    _sum: { quantity: true },
  });
  const consumed = new Map(packed.map((p) => [p.mappingReportId, p._sum.quantity ?? 0]));

  return reports
    .map((r) => ({
      id: r.id,
      name: r.subCategory.description,
      serial: r.serial,
      status: r.status as 'transfer' | 'salvage',
      quantity: r.quantity,
      remaining: r.quantity - (consumed.get(r.id) ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** What the room check after a close needs: is anything left, and is anything awaiting disposal. */
export async function roomTotals(
  client: Tx,
  roomId: number,
): Promise<{ remaining: number; disposalRemaining: number }> {
  const reports = await packableReports(client, roomId);
  const disposal = await client.mappingReport.aggregate({
    where: { roomId, isAvailable: true, status: 'disposal' },
    _sum: { quantity: true },
  });
  return {
    remaining: reports.reduce((n, r) => n + r.remaining, 0),
    disposalRemaining: disposal._sum.quantity ?? 0,
  };
}

export async function listPackableItems(roomId: number): Promise<PackableItemDTO[]> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw Errors.notFound('חדר');
  assertRoomPackable(room);
  const reports = await packableReports(db, roomId);
  return reports
    .filter((r) => r.remaining > 0)
    .map((r) => ({
      mappingReportId: r.id,
      name: r.name,
      serial: r.serial,
      status: r.status,
      remaining: r.remaining,
    }));
}

export async function listPackingUnits(
  filter: { status?: PackingUnitStatus; roomId?: number } = {},
): Promise<PackingUnitSummaryDTO[]> {
  const rows = await db.packingUnit.findMany({
    where: {
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.roomId === undefined ? {} : { sourceRoomId: filter.roomId }),
    },
    include: PACKING_UNIT_SUMMARY_INCLUDE,
    orderBy: { id: 'asc' },
  });
  return rows.map(toPackingUnitSummaryDTO);
}

/** Reads a box back through the same client that just wrote it, so actions return fresh data. */
export async function loadPackingUnitDTO(client: Tx, id: number): Promise<PackingUnitDTO> {
  const row = await client.packingUnit.findUnique({ where: { id }, include: PACKING_UNIT_INCLUDE });
  if (!row) throw Errors.notFound('אריזה');
  return toPackingUnitDTO(row);
}

export async function getPackingUnit(id: number): Promise<PackingUnitDTO> {
  return loadPackingUnitDTO(db, id);
}

export async function getPackingUnitByCode(code: string): Promise<PackingUnitDTO> {
  const row = await db.packingUnit.findUnique({
    where: { code: normalizeCode(code) },
    include: PACKING_UNIT_INCLUDE,
  });
  if (!row) throw Errors.notFound(`אריזה ${normalizeCode(code)}`);
  return toPackingUnitDTO(row);
}

export async function loadTransportUnitDTO(client: Tx, id: number): Promise<TransportUnitDTO> {
  const row = await client.transportUnit.findUnique({ where: { id }, include: TRANSPORT_UNIT_INCLUDE });
  if (!row) throw Errors.notFound('יחידת הובלה');
  return toTransportUnitDTO(row);
}

export async function listTransportUnits(status?: TransportStatus): Promise<TransportUnitDTO[]> {
  const rows = await db.transportUnit.findMany({
    where: status === undefined ? {} : { status },
    include: TRANSPORT_UNIT_INCLUDE,
    orderBy: { id: 'desc' },
  });
  return rows.map(toTransportUnitDTO);
}
```

- [ ] **Step 4: Create `src/lib/lifecycle/index.ts`**

```ts
// The only entry point routes and tests import. Re-export every public lifecycle function here.
export * from './dto';
export * from './events';
export * from './queries';
export * from './transitions';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/queries.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Create `src/lib/api/schemas.ts`**

```ts
import { z } from 'zod';
import { BOX_CODE_RE, PACKING_UNIT_STATUSES, PACKING_UNIT_TYPES, TRANSPORT_STATUSES, TRANSPORT_TYPES } from '@/lib/contracts';

/**
 * Membership check written as a refinement rather than z.enum, so it takes the frozen
 * `readonly` tuples from contracts.ts unchanged and behaves the same on zod 3 and 4.
 */
export function oneOf<T extends string>(values: readonly T[], messageHe: string) {
  return z.string().refine((v): v is T => (values as readonly string[]).includes(v), messageHe);
}

export const idParamSchema = z.coerce.number().int().positive();
export const boxCodeSchema = z.string().trim().regex(BOX_CODE_RE, 'מספר אריזה חייב להיות 5 ספרות');
export const quantitySchema = z.number().int().min(0);
export const shortTextSchema = z.string().trim().min(1).max(60);

export const listPackingUnitsQuery = z.object({
  status: oneOf(PACKING_UNIT_STATUSES, 'סטטוס אריזה לא חוקי').optional(),
  roomId: idParamSchema.optional(),
});

export const transportStatusQuery = oneOf(TRANSPORT_STATUSES, 'סטטוס הובלה לא חוקי').optional();

export const openPackingUnitSchema = z.object({
  sourceRoomId: idParamSchema,
  type: oneOf(PACKING_UNIT_TYPES, 'סוג יחידת אריזה לא חוקי'),
});

export const setItemsSchema = z.object({
  items: z.array(z.object({ mappingReportId: idParamSchema, quantity: z.number().int().min(1) })),
});

export const closePackingUnitSchema = z.object({
  destBuilding: shortTextSchema,
  destFloor: shortTextSchema,
  destRoom: shortTextSchema,
});

export const createTransportSchema = z.object({
  type: oneOf(TRANSPORT_TYPES, 'סוג יחידת הובלה לא חוקי'),
  typeDetails: z.string().trim().max(60).optional(),
  licensePlate: shortTextSchema,
  groupId: idParamSchema,
});

export const loadSchema = z.object({ codes: z.array(boxCodeSchema).min(1, 'לא נבחרו אריזות') });

export const receiveSchema = z.object({
  receivedCodes: z.array(boxCodeSchema),
  surplusCodes: z.array(boxCodeSchema),
});

export const distributeSchema = z.object({
  items: z.array(z.object({ packingUnitItemId: idParamSchema, quantity: quantitySchema })),
  atRoom: shortTextSchema,
});
```

- [ ] **Step 7: Add the three read routes**

`src/app/api/rooms/[id]/packable-items/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/api/schemas';
import { listPackableItems } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireActor();
    const { id } = await params;
    return listPackableItems(idParamSchema.parse(id));
  });
}
```

`src/app/api/packing-units/route.ts` (the POST half arrives in Task 3)

```ts
import { handle } from '@/lib/api/respond';
import { listPackingUnitsQuery } from '@/lib/api/schemas';
import { listPackingUnits } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const p = new URL(req.url).searchParams;
    const filter = listPackingUnitsQuery.parse({
      status: p.get('status') ?? undefined,
      roomId: p.get('roomId') ?? undefined,
    });
    return listPackingUnits(filter);
  });
}
```

`src/app/api/packing-units/by-code/[code]/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import { boxCodeSchema } from '@/lib/api/schemas';
import { getPackingUnitByCode } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    await requireActor();
    const { code } = await params;
    return getPackingUnitByCode(boxCodeSchema.parse(decodeURIComponent(code)));
  });
}
```

- [ ] **Step 8: Smoke-test the routes**

With `AUTH_BYPASS=1` in `.env`, run `npm run dev` in one terminal, then in another:

```bash
curl -s "http://localhost:3000/api/rooms/1/packable-items"
curl -s "http://localhost:3000/api/packing-units?status=closed"
curl -si "http://localhost:3000/api/packing-units/by-code/00000" | head -1
```

Expected: a JSON array of items for room 1 (the seeded "חדר 101"); `[]` for the box list; `HTTP/1.1 404` for the unknown code.

- [ ] **Step 9: Commit**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add src/lib tests/lifecycle src/app/api
git commit -m "feat(lifecycle): read models, request schemas and read routes"
```

---

### Task 3: Open a packing unit and set its contents

**Files:**
- Create: `src/lib/lifecycle/pack.ts`, `src/app/api/packing-units/[id]/items/route.ts`
- Modify: `src/lib/lifecycle/index.ts` (add `export * from './pack';`), `src/app/api/packing-units/route.ts` (add `POST`)
- Test: `tests/lifecycle/pack-open.test.ts`

**Interfaces:**
- Consumes: `assertTransition`, `recordEvent`, `assertRoomPackable`, `packableReports`, `loadPackingUnitDTO`; `type Actor` from `@/lib/session`; `OpenPackingUnitReq`, `SetItemsReq`, `PackingUnitDTO` from `@/lib/contracts`.
- Produces:
  - `openPackingUnit(actor: Actor, req: OpenPackingUnitReq): Promise<PackingUnitDTO>`
  - `setPackingUnitItems(actor: Actor, packingUnitId: number, req: SetItemsReq): Promise<PackingUnitDTO>`
  - `POST /api/packing-units`, `PUT /api/packing-units/:id/items`

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/pack-open.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { openPackingUnit, setPackingUnitItems } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('open a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  it('opens a box, records the event and moves the room into packing', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' });
    expect(unit).toMatchObject({
      status: 'open',
      code: null,
      type: 'professional_carton',
      sourceRoomId: fx.roomA,
      sourceRoomName: 'חדר A',
      groupName: 'מדור בדיקות',
      packedByName: 'בודק',
      items: [],
    });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('packing');
    const events = await db.statusEvent.findMany({ orderBy: { id: 'asc' } });
    expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([
      ['packing_unit', null, 'open'],
      ['room', 'done', 'packing'],
    ]);
  });

  it('leaves the room alone when a second box opens', async () => {
    await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' });
    await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    expect(await db.statusEvent.count({ where: { entityType: 'room' } })).toBe(1);
  });

  it('refuses an unmapped room', async () => {
    await expect(
      openPackingUnit(actor, { sourceRoomId: fx.roomUnmapped, type: 'professional_carton' }),
    ).rejects.toMatchObject({ code: 'ROOM_NOT_MAPPED' });
    expect(await db.packingUnit.count()).toBe(0);
  });
});

describe('set packing unit items', () => {
  let fx: Fixture;
  let actor: Actor;
  let unitId: number;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    unitId = (await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'professional_carton' })).id;
  });

  it('stores the chosen items with their quantities, sorted A–Z', async () => {
    const unit = await setPackingUnitItems(actor, unitId, {
      items: [
        { mappingReportId: fx.reports.monitor, quantity: 1 },
        { mappingReportId: fx.reports.laptop, quantity: 2 },
      ],
    });
    expect(unit.items.map((i) => [i.name, i.quantity, i.itemStatus])).toEqual([
      ['מחשב נייד', 2, 'packed'],
      ['מסך', 1, 'packed'],
    ]);
  });

  it('writes no item events before the box closes', async () => {
    await setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] });
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit_item' } })).toBe(0);
  });

  it('replaces the contents on a second call without double-counting remaining', async () => {
    await setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    // Same box, same two laptops — this is an edit, not another two laptops.
    const unit = await setPackingUnitItems(actor, unitId, {
      items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }],
    });
    expect(unit.items).toHaveLength(1);
    expect(unit.items[0].quantity).toBe(2);
    expect(await db.packingUnitItem.count({ where: { packingUnitId: unitId } })).toBe(1);
  });

  it('rejects more than the room has left', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 3 }] }),
    ).rejects.toMatchObject({
      code: 'QUANTITY_EXCEEDS_REMAINING',
      messageHe: 'הכמות עבור "מחשב נייד" גדולה מהמותר (2)',
    });
  });

  it('counts what another box already took', async () => {
    const other = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    await setPackingUnitItems(actor, other.id, { items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'QUANTITY_EXCEEDS_REMAINING' });
  });

  it('rejects an item from another room and a disposal item', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db.mappingReport.update({ where: { id: fx.reports.printer }, data: { roomId: fx.roomA } });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.printer, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects the same item twice in one request', async () => {
    await expect(
      setPackingUnitItems(actor, unitId, {
        items: [
          { mappingReportId: fx.reports.laptop, quantity: 1 },
          { mappingReportId: fx.reports.laptop, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses items on a personal carton', async () => {
    const personal = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'personal_carton' });
    await expect(
      setPackingUnitItems(actor, personal.id, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION', messageHe: 'קרטון אישי אינו מכיל פריטים' });
  });

  it('refuses to edit a box that is no longer open', async () => {
    await db.packingUnit.update({ where: { id: unitId }, data: { status: 'closed', code: '10001' } });
    await expect(
      setPackingUnitItems(actor, unitId, { items: [{ mappingReportId: fx.reports.laptop, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
```

- [ ] **Step 2: Add the test actor helper** — `tests/helpers/chain.ts` (first slice; Task 8 adds the rest)

```ts
import { db } from '@/lib/db';
import type { Role } from '@/lib/contracts';
import type { Actor } from '@/lib/session';

/** Turns a fixture user id into the Actor every lifecycle action expects. */
export async function actorOf(userId: number): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/lifecycle/pack-open.test.ts`
Expected: FAIL — `openPackingUnit is not a function` (nothing exports it yet).

- [ ] **Step 4: Implement `src/lib/lifecycle/pack.ts`**

```ts
import type { OpenPackingUnitReq, PackingUnitDTO, SetItemsReq } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { PACKING_UNIT_STATUS_LABELS, statusLabel } from '@/lib/labels';
import type { Actor } from '@/lib/session';
import { recordEvent } from './events';
import { assertRoomPackable, loadPackingUnitDTO, packableReports } from './queries';
import { assertTransition } from './transitions';

export async function openPackingUnit(actor: Actor, req: OpenPackingUnitReq): Promise<PackingUnitDTO> {
  return db.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: req.sourceRoomId } });
    if (!room) throw Errors.notFound('חדר');
    assertRoomPackable(room);

    const unit = await tx.packingUnit.create({
      data: { type: req.type, status: 'open', sourceRoomId: room.id, packedById: actor.id },
    });
    await recordEvent(tx, {
      entityType: 'packing_unit', entityId: unit.id, fromStatus: null, toStatus: 'open', actorId: actor.id,
    });

    // The first box opened in a mapped room moves it to 'packing'; later boxes find it already there.
    if (room.status === 'done') {
      assertTransition('room', room.status, 'packing');
      await tx.room.update({ where: { id: room.id }, data: { status: 'packing' } });
      await recordEvent(tx, {
        entityType: 'room', entityId: room.id, fromStatus: room.status, toStatus: 'packing', actorId: actor.id,
      });
    }

    return loadPackingUnitDTO(tx, unit.id);
  });
}

/**
 * Replaces the whole contents of an open box (PUT semantics — the packer edits the list on screen).
 * No item events are written here; see the plan's conventions — they are written on close.
 */
export async function setPackingUnitItems(
  actor: Actor,
  packingUnitId: number,
  req: SetItemsReq,
): Promise<PackingUnitDTO> {
  return db.$transaction(async (tx) => {
    const unit = await tx.packingUnit.findUnique({ where: { id: packingUnitId } });
    if (!unit) throw Errors.notFound('אריזה');
    // Editing a box that already left the packer is out of scope for the MVP.
    if (unit.status !== 'open') {
      throw Errors.illegalTransition(statusLabel('packing_unit', unit.status), PACKING_UNIT_STATUS_LABELS.open);
    }
    if (unit.type === 'personal_carton') throw Errors.validation('קרטון אישי אינו מכיל פריטים');

    const seen = new Set<number>();
    for (const line of req.items) {
      if (seen.has(line.mappingReportId)) throw Errors.validation('אותו פריט נבחר פעמיים');
      seen.add(line.mappingReportId);
    }

    // Remaining excludes this box's own rows, so re-saving the same quantities is not a conflict.
    const reports = await packableReports(tx, unit.sourceRoomId, unit.id);
    const byId = new Map(reports.map((r) => [r.id, r]));
    for (const line of req.items) {
      const report = byId.get(line.mappingReportId);
      if (!report) throw Errors.notFound('פריט');
      if (line.quantity > report.remaining) throw Errors.quantityExceeds(report.name, report.remaining);
    }

    await tx.packingUnitItem.deleteMany({ where: { packingUnitId: unit.id } });
    if (req.items.length > 0) {
      await tx.packingUnitItem.createMany({
        data: req.items.map((line) => ({
          packingUnitId: unit.id,
          mappingReportId: line.mappingReportId,
          quantity: line.quantity,
        })),
      });
    }

    return loadPackingUnitDTO(tx, unit.id);
  });
}
```

Note why the "still open" check is written by hand rather than through `assertTransition`: `open → open` is not a transition, so the table would reject a perfectly legal second edit of the same box. The explicit comparison gives the same Hebrew error for every status that really is too late to edit.

- [ ] **Step 5: Export it** — add to `src/lib/lifecycle/index.ts`

```ts
export * from './pack';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/pack-open.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Add `POST` to `src/app/api/packing-units/route.ts`**

Append below the existing `GET`:

```ts
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    return openPackingUnit(actor, openPackingUnitSchema.parse(await req.json()));
  });
}
```

and extend the imports at the top of the file:

```ts
import { listPackingUnitsQuery, openPackingUnitSchema } from '@/lib/api/schemas';
import { listPackingUnits, openPackingUnit } from '@/lib/lifecycle';
```

- [ ] **Step 8: Create `src/app/api/packing-units/[id]/items/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { idParamSchema, setItemsSchema } from '@/lib/api/schemas';
import { setPackingUnitItems } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return setPackingUnitItems(actor, idParamSchema.parse(id), setItemsSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 9: Smoke-test**

```bash
curl -s -X POST localhost:3000/api/packing-units -H 'Content-Type: application/json' -d '{"sourceRoomId":1,"type":"professional_carton"}'
curl -s -X PUT localhost:3000/api/packing-units/1/items -H 'Content-Type: application/json' -d '{"items":[{"mappingReportId":1,"quantity":1}]}'
```

Expected: the first returns a box with `"status":"open"` and `"code":null`; the second returns the same box with one item. (`npm run demo:reset` first if the seed ids have drifted.)

- [ ] **Step 10: Commit**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add -A && git commit -m "feat(lifecycle): open a packing unit and set its contents"
```

---

### Task 4: Close a packing unit — code assignment and the room check

The densest task in the plan: this is where a box gets its identity and where a room closes.

**Files:**
- Modify: `src/lib/lifecycle/pack.ts`
- Create: `src/app/api/packing-units/[id]/close/route.ts`
- Test: `tests/lifecycle/pack-close.test.ts`

**Interfaces:**
- Consumes: Task 3's `openPackingUnit`, `setPackingUnitItems`; `roomTotals`, `ROOM_TRANSITIONS`, `recordEvent`, `assertTransition`, `loadPackingUnitDTO`.
- Produces: `closePackingUnit(actor: Actor, packingUnitId: number, req: ClosePackingUnitReq): Promise<ClosePackingUnitResult>`; `POST /api/packing-units/:id/close`.

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/pack-close.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { closePackingUnit, openPackingUnit, setPackingUnitItems } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

const DEST = { destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' };

describe('close a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  async function openWith(roomId: number, items: { mappingReportId: number; quantity: number }[]) {
    const unit = await openPackingUnit(actor, { sourceRoomId: roomId, type: 'professional_carton' });
    await setPackingUnitItems(actor, unit.id, { items });
    return unit.id;
  }

  it('assigns a 5-digit code, stores the destination and marks the items packed', async () => {
    const id = await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]);
    const { unit, roomCheck } = await closePackingUnit(actor, id, DEST);

    expect(unit.code).toMatch(/^\d{5}$/);
    expect(unit).toMatchObject({ status: 'closed', destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' });
    expect(unit.closedAt).not.toBeNull();
    expect(unit.items.map((i) => i.itemStatus)).toEqual(['packed']);
    expect(roomCheck).toEqual({ remaining: 2, disposalRemaining: 0, roomStatus: 'packing' });

    const itemEvents = await db.statusEvent.findMany({ where: { entityType: 'packing_unit_item' } });
    expect(itemEvents.map((e) => [e.fromStatus, e.toStatus])).toEqual([[null, 'packed']]);
  });

  it('hands out codes in ascending order, each unique', async () => {
    const a = await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]), DEST);
    const b = await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.monitor, quantity: 1 }]), DEST);
    expect(a.unit.code).toBe('10001');
    expect(b.unit.code).toBe('10002');
  });

  it('closes the room once nothing transferable is left', async () => {
    await closePackingUnit(actor, await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 2 }]), DEST);
    const { roomCheck } = await closePackingUnit(
      actor,
      await openWith(fx.roomA, [{ mappingReportId: fx.reports.monitor, quantity: 1 }]),
      DEST,
    );
    expect(roomCheck).toEqual({ remaining: 0, disposalRemaining: 0, roomStatus: 'closed' });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('closed');
    const roomEvents = await db.statusEvent.findMany({ where: { entityType: 'room', entityId: fx.roomA } });
    expect(roomEvents.map((e) => e.toStatus)).toEqual(['packing', 'closed']);
  });

  it('sends a room with leftover disposal items to awaiting_disposal', async () => {
    const { roomCheck } = await closePackingUnit(
      actor,
      await openWith(fx.roomB, [{ mappingReportId: fx.reports.chair, quantity: 1 }]),
      DEST,
    );
    expect(roomCheck).toEqual({ remaining: 0, disposalRemaining: 1, roomStatus: 'awaiting_disposal' });
  });

  it('skips the room check for a personal carton', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'personal_carton' });
    const { unit: closed, roomCheck } = await closePackingUnit(actor, unit.id, DEST);
    expect(roomCheck).toBeNull();
    expect(closed.code).toMatch(/^\d{5}$/);
    expect(closed.items).toEqual([]);
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('packing');
  });

  it('refuses to close an empty non-personal box', async () => {
    const unit = await openPackingUnit(actor, { sourceRoomId: fx.roomA, type: 'pallet' });
    await expect(closePackingUnit(actor, unit.id, DEST)).rejects.toMatchObject({
      code: 'VALIDATION',
      messageHe: 'יש לבחור פריטים לאריזה',
    });
    expect((await db.packingUnit.findUniqueOrThrow({ where: { id: unit.id } })).code).toBeNull();
  });

  it('refuses to close the same box twice', async () => {
    const id = await openWith(fx.roomA, [{ mappingReportId: fx.reports.laptop, quantity: 1 }]);
    await closePackingUnit(actor, id, DEST);
    await expect(closePackingUnit(actor, id, DEST)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lifecycle/pack-close.test.ts`
Expected: FAIL — `closePackingUnit is not a function`.

- [ ] **Step 3: Add the close action to `src/lib/lifecycle/pack.ts`**

Extend the imports at the top of the file:

```ts
import { Prisma } from '@prisma/client';
import type { ClosePackingUnitReq, ClosePackingUnitResult, RoomCheckDTO, RoomStatus } from '@/lib/contracts';
import type { Tx } from '@/lib/db';
import { roomTotals } from './queries';
import { ROOM_TRANSITIONS } from './transitions';
```

Then append:

```ts
const FIRST_CODE = 10_001;

/**
 * Next code = highest existing + 1. Two simultaneous closes can pick the same number; the unique
 * index catches it and closePackingUnit retries.
 * TODO: a Postgres sequence would be cleaner, but prisma/schema.prisma is P1-owned and frozen.
 */
async function allocateCode(tx: Tx): Promise<string> {
  const { _max } = await tx.packingUnit.aggregate({ _max: { code: true } });
  const next = _max.code ? Number(_max.code.trim()) + 1 : FIRST_CODE;
  if (next > 99_999) throw Errors.validation('נגמרו מספרי האריזות');
  return String(next).padStart(5, '0');
}

/** Spec §3 invariant 2: the server — never the client — decides that a room is finished. */
async function applyRoomCheck(tx: Tx, actor: Actor, roomId: number): Promise<RoomCheckDTO> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  const { remaining, disposalRemaining } = await roomTotals(tx, roomId);
  let status = room.status as RoomStatus;

  if (remaining === 0) {
    const next: RoomStatus = disposalRemaining > 0 ? 'awaiting_disposal' : 'closed';
    if (next !== status && ROOM_TRANSITIONS[status].includes(next)) {
      await tx.room.update({ where: { id: roomId }, data: { status: next } });
      await recordEvent(tx, {
        entityType: 'room', entityId: roomId, fromStatus: status, toStatus: next, actorId: actor.id,
      });
      status = next;
    }
  }

  return { remaining, disposalRemaining, roomStatus: status };
}

async function closeOnce(
  actor: Actor,
  packingUnitId: number,
  req: ClosePackingUnitReq,
): Promise<ClosePackingUnitResult> {
  return db.$transaction(async (tx) => {
    const unit = await tx.packingUnit.findUnique({ where: { id: packingUnitId }, include: { items: true } });
    if (!unit) throw Errors.notFound('אריזה');
    assertTransition('packing_unit', unit.status, 'closed');
    if (unit.type !== 'personal_carton' && unit.items.length === 0) {
      throw Errors.validation('יש לבחור פריטים לאריזה');
    }

    const code = await allocateCode(tx);
    await tx.packingUnit.update({
      where: { id: unit.id },
      data: {
        code,
        status: 'closed',
        closedAt: new Date(),
        destBuilding: req.destBuilding.trim(),
        destFloor: req.destFloor.trim(),
        destRoom: req.destRoom.trim(),
      },
    });
    await recordEvent(tx, {
      entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'closed',
      actorId: actor.id, note: `אריזה ${code}`,
    });

    // Contents become real at close — that is when each item gets its 'packed' event.
    for (const item of unit.items) {
      await recordEvent(tx, {
        entityType: 'packing_unit_item', entityId: item.id, fromStatus: null, toStatus: 'packed', actorId: actor.id,
      });
    }

    const roomCheck = unit.type === 'personal_carton' ? null : await applyRoomCheck(tx, actor, unit.sourceRoomId);
    return { unit: await loadPackingUnitDTO(tx, unit.id), roomCheck };
  });
}

export async function closePackingUnit(
  actor: Actor,
  packingUnitId: number,
  req: ClosePackingUnitReq,
): Promise<ClosePackingUnitResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await closeOnce(actor, packingUnitId, req);
    } catch (e) {
      const duplicateCode = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (duplicateCode && attempt < 4) continue;
      throw e;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/pack-close.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Create `src/app/api/packing-units/[id]/close/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { closePackingUnitSchema, idParamSchema } from '@/lib/api/schemas';
import { closePackingUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return closePackingUnit(actor, idParamSchema.parse(id), closePackingUnitSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 6: Smoke-test the whole pack flow**

```bash
npm run demo:reset
curl -s -X POST localhost:3000/api/packing-units -H 'Content-Type: application/json' -d '{"sourceRoomId":1,"type":"professional_carton"}'
curl -s -X PUT localhost:3000/api/packing-units/1/items -H 'Content-Type: application/json' -d '{"items":[{"mappingReportId":1,"quantity":2}]}'
curl -s -X POST localhost:3000/api/packing-units/1/close -H 'Content-Type: application/json' -d '{"destBuilding":"בניין 7","destFloor":"קומה 2","destRoom":"חדר 214"}'
```

Expected: the last call returns `{"unit":{...,"code":"10001","status":"closed"},"roomCheck":{"remaining":...}}`.

- [ ] **Step 7: Commit and tell P3**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add -A && git commit -m "feat(lifecycle): close a packing unit, assign its code and run the room check"
git checkout main && git pull && git merge --ff-only p2/lifecycle-core && git push
git checkout -b p2/transport
```

Post in team chat: "Pack routes on `main`: `POST /api/packing-units`, `PUT /api/packing-units/:id/items`, `POST /api/packing-units/:id/close`, `GET /api/rooms/:id/packable-items`, `GET /api/packing-units`, `GET /api/packing-units/by-code/:code`. `api.*` in `src/lib/api/client.ts` already points at them."

---

### Task 5: Create a transport unit and load it

**Files:**
- Create: `src/lib/lifecycle/transport.ts`, `src/app/api/transport-units/route.ts`, `src/app/api/transport-units/[id]/load/route.ts`
- Modify: `src/lib/lifecycle/index.ts` (add `export * from './transport';`)
- Test: `tests/lifecycle/load.test.ts`

**Interfaces:**
- Consumes: Task 1–4 primitives; `loadTransportUnitDTO`, `listTransportUnits`, `normalizeCode`, `formatHe`, `notify`.
- Produces:
  - `createTransportUnit(actor: Actor, req: CreateTransportReq): Promise<TransportUnitDTO>`
  - `loadTransportUnit(actor: Actor, transportUnitId: number, req: LoadReq): Promise<TransportUnitDTO>`
  - `GET /api/transport-units?status=`, `POST /api/transport-units`, `POST /api/transport-units/:id/load`

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/load.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTransportUnit, listTransportUnits, loadTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('load a transport unit', () => {
  let fx: Fixture;
  let actor: Actor;
  let truckId: number;
  let codeA: string;
  let codeB: string;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    codeA = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] })).code!;
    codeB = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }] })).code!;
    truckId = (await createTransportUnit(actor, { type: 'truck', licensePlate: '12-345-67', groupId: fx.groupId })).id;
  });

  it('creates a truck in loading with its own event', async () => {
    const truck = await db.transportUnit.findUniqueOrThrow({ where: { id: truckId } });
    expect(truck).toMatchObject({ status: 'loading', licensePlate: '12-345-67', departedAt: null });
    expect(await db.statusEvent.count({ where: { entityType: 'transport_unit', toStatus: 'loading' } })).toBe(1);
  });

  it('moves every scanned box and the truck to in_transit and sends one SMS', async () => {
    const truck = await loadTransportUnit(actor, truckId, { codes: [codeA, codeB] });

    expect(truck.status).toBe('in_transit');
    expect(truck.departedAt).not.toBeNull();
    expect(truck.boxes.map((b) => b.code)).toEqual([codeA, codeB].sort());
    expect(truck.boxes.every((b) => b.status === 'in_transit')).toBe(true);

    const boxEvents = await db.statusEvent.findMany({ where: { entityType: 'packing_unit', toStatus: 'in_transit' } });
    expect(boxEvents).toHaveLength(2);
    expect(boxEvents[0].note).toContain('12-345-67');

    const sms = await db.notification.findMany();
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain('יחידת הובלה הועמסה');
    expect(sms[0].body).toContain('12-345-67');
    expect(sms[0].body).toContain('2 אריזות');
  });

  it('treats a box scanned twice in one load as one box', async () => {
    const truck = await loadTransportUnit(actor, truckId, { codes: [codeA, codeA, ' ' + codeA + ' '] });
    expect(truck.boxes).toHaveLength(1);
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit', toStatus: 'in_transit' } })).toBe(1);
    expect((await db.notification.findFirstOrThrow()).body).toContain('1 אריזות');
  });

  it('rejects an unknown code and changes nothing', async () => {
    await expect(loadTransportUnit(actor, truckId, { codes: [codeA, '99999'] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    expect(await db.packingUnit.count({ where: { status: 'in_transit' } })).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it('rejects a box that is already on another truck, and changes nothing', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    const second = await createTransportUnit(actor, { type: 'truck', licensePlate: '99-888-77', groupId: fx.groupId });
    await expect(loadTransportUnit(actor, second.id, { codes: [codeA, codeB] })).rejects.toMatchObject({
      code: 'ILLEGAL_TRANSITION',
    });
    expect((await db.packingUnit.findFirstOrThrow({ where: { code: codeB } })).status).toBe('closed');
  });

  it('rejects loading a truck that already departed', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    await expect(loadTransportUnit(actor, truckId, { codes: [codeB] })).rejects.toMatchObject({
      code: 'ILLEGAL_TRANSITION',
    });
  });

  it('lists trucks by status for the receiving screen', async () => {
    await loadTransportUnit(actor, truckId, { codes: [codeA] });
    await createTransportUnit(actor, { type: 'other', typeDetails: 'רכב פרטי', licensePlate: '55-555-55', groupId: fx.groupId });
    expect((await listTransportUnits('in_transit')).map((t) => t.id)).toEqual([truckId]);
    expect(await listTransportUnits('loading')).toHaveLength(1);
    expect(await listTransportUnits()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Add `packBox` to `tests/helpers/chain.ts`**

Append to the file created in Task 3:

```ts
import type { PackingUnitDTO, PackingUnitType } from '@/lib/contracts';
import { closePackingUnit, openPackingUnit, setPackingUnitItems } from '@/lib/lifecycle';

export const DEFAULT_DEST = { destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' };

export interface PackBoxOptions {
  roomId: number;
  items?: { mappingReportId: number; quantity: number }[];
  type?: PackingUnitType;
  dest?: { destBuilding: string; destFloor: string; destRoom: string };
}

/** Opens a box, fills it and closes it. Returns the closed box, code assigned. */
export async function packBox(actor: Actor, opts: PackBoxOptions): Promise<PackingUnitDTO> {
  const type = opts.type ?? 'professional_carton';
  const unit = await openPackingUnit(actor, { sourceRoomId: opts.roomId, type });
  if (type !== 'personal_carton') {
    await setPackingUnitItems(actor, unit.id, { items: opts.items ?? [] });
  }
  const { unit: closed } = await closePackingUnit(actor, unit.id, opts.dest ?? DEFAULT_DEST);
  return closed;
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/lifecycle/load.test.ts`
Expected: FAIL — `createTransportUnit is not a function`.

- [ ] **Step 4: Implement `src/lib/lifecycle/transport.ts`**

```ts
import type { CreateTransportReq, LoadReq, TransportUnitDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import type { Actor } from '@/lib/session';
import { normalizeCode } from './dto';
import { formatHe, notify, recordEvent } from './events';
import { loadTransportUnitDTO } from './queries';
import { assertTransition } from './transitions';

export async function createTransportUnit(actor: Actor, req: CreateTransportReq): Promise<TransportUnitDTO> {
  return db.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: req.groupId } });
    if (!group) throw Errors.notFound('מדור');

    const truck = await tx.transportUnit.create({
      data: {
        type: req.type,
        typeDetails: req.typeDetails?.trim() || null,
        licensePlate: req.licensePlate.trim(),
        groupId: group.id,
        status: 'loading',
        createdById: actor.id,
      },
    });
    await recordEvent(tx, {
      entityType: 'transport_unit', entityId: truck.id, fromStatus: null, toStatus: 'loading', actorId: actor.id,
    });
    return loadTransportUnitDTO(tx, truck.id);
  });
}

/**
 * Attaches every scanned box to the truck and sends it on its way. One call per truck:
 * the truck departs here, so a second load on the same truck is rejected.
 * TODO: boxes are not checked against the truck's group — the demo never mixes groups.
 */
export async function loadTransportUnit(
  actor: Actor,
  transportUnitId: number,
  req: LoadReq,
): Promise<TransportUnitDTO> {
  return db.$transaction(
    async (tx) => {
      const truck = await tx.transportUnit.findUnique({ where: { id: transportUnitId } });
      if (!truck) throw Errors.notFound('יחידת הובלה');
      assertTransition('transport_unit', truck.status, 'in_transit');

      // The client accumulates raw scans, so the same box can arrive several times.
      const codes = [...new Set(req.codes.map(normalizeCode))];
      const units = await tx.packingUnit.findMany({ where: { code: { in: codes } } });
      const byCode = new Map(units.map((u) => [normalizeCode(u.code ?? ''), u]));

      // Validate everything before writing anything: a bad code must leave the truck untouched.
      for (const code of codes) {
        const unit = byCode.get(code);
        if (!unit) throw Errors.notFound(`אריזה ${code}`);
        assertTransition('packing_unit', unit.status, 'in_transit');
      }

      const departedAt = new Date();
      for (const code of codes) {
        const unit = byCode.get(code)!;
        await tx.packingUnit.update({
          where: { id: unit.id },
          data: { status: 'in_transit', transportUnitId: truck.id },
        });
        await recordEvent(tx, {
          entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'in_transit',
          actorId: actor.id, note: `הועמסה על ${truck.licensePlate}`,
        });
      }

      await tx.transportUnit.update({
        where: { id: truck.id },
        data: { status: 'in_transit', departedAt },
      });
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: truck.status, toStatus: 'in_transit',
        actorId: actor.id,
      });
      await notify(tx, {
        entityType: 'transport_unit',
        entityId: truck.id,
        body: `יחידת הובלה הועמסה — מס' רישוי ${truck.licensePlate}, ${codes.length} אריזות, ${formatHe(departedAt)}`,
      });

      return loadTransportUnitDTO(tx, truck.id);
    },
    { timeout: 15_000 },
  );
}
```

- [ ] **Step 5: Export it** — add `export * from './transport';` to `src/lib/lifecycle/index.ts`

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/load.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Add the routes**

`src/app/api/transport-units/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import { createTransportSchema, transportStatusQuery } from '@/lib/api/schemas';
import { createTransportUnit, listTransportUnits } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const status = transportStatusQuery.parse(new URL(req.url).searchParams.get('status') ?? undefined);
    return listTransportUnits(status);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    return createTransportUnit(actor, createTransportSchema.parse(await req.json()));
  });
}
```

`src/app/api/transport-units/[id]/load/route.ts`

```ts
import { handle } from '@/lib/api/respond';
import { idParamSchema, loadSchema } from '@/lib/api/schemas';
import { loadTransportUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return loadTransportUnit(actor, idParamSchema.parse(id), loadSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 8: Smoke-test**

```bash
curl -s -X POST localhost:3000/api/transport-units -H 'Content-Type: application/json' -d '{"type":"truck","licensePlate":"12-345-67","groupId":1}'
curl -s -X POST localhost:3000/api/transport-units/1/load -H 'Content-Type: application/json' -d '{"codes":["10001"]}'
curl -s "localhost:3000/api/transport-units?status=in_transit"
```

Expected: the load call returns the truck with `"status":"in_transit"` and one box; the list call returns it.

- [ ] **Step 9: Commit**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add -A && git commit -m "feat(lifecycle): create and load a transport unit"
```

---

### Task 6: Receive a transport unit — missing and surplus boxes

The zero-loss task: every box that came off the truck is `received`, every box that didn't is explicitly `missing`.

**Files:**
- Modify: `src/lib/lifecycle/transport.ts`
- Create: `src/app/api/transport-units/[id]/receive/route.ts`
- Test: `tests/lifecycle/receive.test.ts`

**Interfaces:**
- Consumes: Task 5's `createTransportUnit`, `loadTransportUnit`; `TRANSPORT_UNLOADED`; `ReceiveReq`, `ReceiveResult` from `@/lib/contracts`.
- Produces: `receiveTransportUnit(actor: Actor, transportUnitId: number, req: ReceiveReq): Promise<ReceiveResult>`; `POST /api/transport-units/:id/receive`.

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/receive.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTransportUnit, loadTransportUnit, receiveTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('receive a transport unit', () => {
  let fx: Fixture;
  let actor: Actor;
  let truckId: number;
  let codeA: string;
  let codeB: string;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    codeA = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] })).code!;
    codeB = (await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }] })).code!;
    truckId = (await loadTruck(actor, { groupId: fx.groupId, codes: [codeA, codeB] })).id;
  });

  it('receives every box, releases the truck and writes the unloaded event', async () => {
    const result = await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, codeB], surplusCodes: [] });

    expect(result.receivedCodes).toEqual([codeA, codeB].sort());
    expect(result.missingCodes).toEqual([]);
    expect(result.surplusCodes).toEqual([]);
    expect(result.transportUnit.status).toBe('released');
    expect(result.transportUnit.releasedAt).not.toBeNull();
    expect(result.transportUnit.boxes.every((b) => b.status === 'received')).toBe(true);

    const truckEvents = await db.statusEvent.findMany({
      where: { entityType: 'transport_unit', entityId: truckId }, orderBy: { id: 'asc' },
    });
    expect(truckEvents.map((e) => e.toStatus)).toEqual(['loading', 'in_transit', 'unloaded', 'released']);
    expect((await db.packingUnitItem.findMany()).every((i) => i.itemStatus === 'received')).toBe(true);
  });

  it('marks an unconfirmed box and its items missing', async () => {
    const result = await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA], surplusCodes: [] });

    expect(result.receivedCodes).toEqual([codeA]);
    expect(result.missingCodes).toEqual([codeB]);
    const missing = await db.packingUnit.findFirstOrThrow({ where: { code: codeB }, include: { items: true } });
    expect(missing.status).toBe('missing');
    expect(missing.items.map((i) => i.itemStatus)).toEqual(['missing']);
    const itemEvent = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit_item', toStatus: 'missing' },
    });
    expect(itemEvent.fromStatus).toBe('packed');
  });

  it('names the missing boxes in the SMS', async () => {
    await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA], surplusCodes: [] });
    const sms = await db.notification.findMany({ orderBy: { id: 'asc' } });
    expect(sms).toHaveLength(2); // one from the load, one from the receive
    expect(sms[1].body).toContain('יחידת הובלה שוחררה');
    expect(sms[1].body).toContain(codeB);
  });

  it('accepts a confirmed surplus box from another truck and attaches it', async () => {
    const codeC = (await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] })).code!;
    const other = await createTransportUnit(actor, { type: 'truck', licensePlate: '99-888-77', groupId: fx.groupId });
    await loadTransportUnit(actor, other.id, { codes: [codeC] });

    const result = await receiveTransportUnit(actor, truckId, {
      receivedCodes: [codeA, codeB],
      surplusCodes: [codeC],
    });
    expect(result.surplusCodes).toEqual([codeC]);
    const surplus = await db.packingUnit.findFirstOrThrow({ where: { code: codeC } });
    expect(surplus.status).toBe('received');
    expect(surplus.transportUnitId).toBe(truckId);
    const event = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit', entityId: surplus.id, toStatus: 'received' },
    });
    expect(event.note).toContain('עודף');
  });

  it('rejects a code that is neither on the truck nor confirmed as surplus', async () => {
    const stray = (await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] })).code!;
    await expect(
      receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, stray], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'NOT_ON_THIS_TRUCK', status: 409 });
    expect((await db.transportUnit.findUniqueOrThrow({ where: { id: truckId } })).status).toBe('in_transit');
  });

  it('processes a code exactly once when it is listed twice or in both lists', async () => {
    const result = await receiveTransportUnit(actor, truckId, {
      receivedCodes: [codeA, codeA, codeB],
      surplusCodes: [codeB],
    });
    expect(result.receivedCodes).toEqual([codeA, codeB].sort());
    expect(result.surplusCodes).toEqual([]);
    expect(result.missingCodes).toEqual([]);
    expect(await db.statusEvent.count({ where: { entityType: 'packing_unit', toStatus: 'received' } })).toBe(2);
  });

  it('refuses a truck that has not departed and one already released', async () => {
    const loading = await createTransportUnit(actor, { type: 'truck', licensePlate: '11-111-11', groupId: fx.groupId });
    await expect(
      receiveTransportUnit(actor, loading.id, { receivedCodes: [], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });

    await receiveTransportUnit(actor, truckId, { receivedCodes: [codeA, codeB], surplusCodes: [] });
    await expect(
      receiveTransportUnit(actor, truckId, { receivedCodes: [], surplusCodes: [] }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });
});
```

- [ ] **Step 2: Add `loadTruck` to `tests/helpers/chain.ts`**

```ts
import type { TransportUnitDTO } from '@/lib/contracts';
import { createTransportUnit, loadTransportUnit } from '@/lib/lifecycle';

/** Creates a truck and sends it off with the given box codes. */
export async function loadTruck(
  actor: Actor,
  opts: { groupId: number; codes: string[]; licensePlate?: string },
): Promise<TransportUnitDTO> {
  const truck = await createTransportUnit(actor, {
    type: 'truck',
    licensePlate: opts.licensePlate ?? '12-345-67',
    groupId: opts.groupId,
  });
  return loadTransportUnit(actor, truck.id, { codes: opts.codes });
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/lifecycle/receive.test.ts`
Expected: FAIL — `receiveTransportUnit is not a function`.

- [ ] **Step 4: Add the receive action to `src/lib/lifecycle/transport.ts`**

Extend the imports:

```ts
import type { ItemStatus, ReceiveReq, ReceiveResult } from '@/lib/contracts';
import type { Tx } from '@/lib/db';
import { TRANSPORT_UNLOADED } from './transitions';
```

Then append:

```ts
const SURPLUS_NOTE = 'עודף — התקבלה למרות שלא הועמסה על יחידת הובלה זו';

/** Moves every item of a box to the same status as the box, each with its own event. */
async function setItemsStatus(
  tx: Tx,
  actor: Actor,
  packingUnitId: number,
  to: ItemStatus,
  note?: string,
): Promise<void> {
  const items = await tx.packingUnitItem.findMany({ where: { packingUnitId } });
  for (const item of items) {
    assertTransition('packing_unit_item', item.itemStatus, to);
    await tx.packingUnitItem.update({ where: { id: item.id }, data: { itemStatus: to } });
    await recordEvent(tx, {
      entityType: 'packing_unit_item', entityId: item.id, fromStatus: item.itemStatus, toStatus: to,
      actorId: actor.id, note,
    });
  }
}

async function markBox(
  tx: Tx,
  actor: Actor,
  unit: { id: number; status: string },
  to: 'received' | 'missing',
  note?: string,
  attachToTruckId?: number,
): Promise<void> {
  assertTransition('packing_unit', unit.status, to);
  await tx.packingUnit.update({
    where: { id: unit.id },
    data: { status: to, ...(attachToTruckId === undefined ? {} : { transportUnitId: attachToTruckId }) },
  });
  await recordEvent(tx, {
    entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: to, actorId: actor.id, note,
  });
  await setItemsStatus(tx, actor, unit.id, to === 'received' ? 'received' : 'missing', note);
}

/**
 * Spec §5.3. Sent once with the final set of codes. Anything loaded on this truck that the
 * unloader did not confirm becomes `missing` — never silently dropped (spec §3 invariant 3).
 */
export async function receiveTransportUnit(
  actor: Actor,
  transportUnitId: number,
  req: ReceiveReq,
): Promise<ReceiveResult> {
  return db.$transaction(
    async (tx) => {
      const truck = await tx.transportUnit.findUnique({
        where: { id: transportUnitId },
        include: { packingUnits: true },
      });
      if (!truck) throw Errors.notFound('יחידת הובלה');
      assertTransition('transport_unit', truck.status, TRANSPORT_UNLOADED);

      const onTruck = new Map(
        truck.packingUnits.filter((u) => u.code !== null).map((u) => [normalizeCode(u.code!), u]),
      );
      const surplusSet = new Set(req.surplusCodes.map(normalizeCode));
      // One set for both lists: a code listed twice, or in both lists, is handled exactly once.
      const confirmed = new Set([...req.receivedCodes, ...req.surplusCodes].map(normalizeCode));

      const receivedCodes: string[] = [];
      const surplusCodes: string[] = [];
      for (const code of confirmed) {
        const unit = onTruck.get(code);
        if (unit) {
          // A code the unloader flagged as surplus that IS on this truck is a normal receive.
          await markBox(tx, actor, unit, 'received');
          receivedCodes.push(code);
          continue;
        }
        if (!surplusSet.has(code)) throw Errors.notOnThisTruck(code);
        const foreign = await tx.packingUnit.findUnique({ where: { code } });
        if (!foreign) throw Errors.notFound(`אריזה ${code}`);
        await markBox(tx, actor, foreign, 'received', SURPLUS_NOTE, truck.id);
        surplusCodes.push(code);
      }

      const missingCodes: string[] = [];
      for (const [code, unit] of onTruck) {
        if (confirmed.has(code)) continue;
        await markBox(tx, actor, unit, 'missing', `לא נפרקה מ${truck.licensePlate}`);
        missingCodes.push(code);
      }

      const releasedAt = new Date();
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: truck.status, toStatus: TRANSPORT_UNLOADED,
        actorId: actor.id,
      });
      assertTransition('transport_unit', TRANSPORT_UNLOADED, 'released');
      await tx.transportUnit.update({ where: { id: truck.id }, data: { status: 'released', releasedAt } });
      await recordEvent(tx, {
        entityType: 'transport_unit', entityId: truck.id, fromStatus: TRANSPORT_UNLOADED, toStatus: 'released',
        actorId: actor.id,
      });

      const missingText = missingCodes.length === 0 ? 'ללא חוסרים' : `אריזות חסרות: ${missingCodes.join(', ')}`;
      await notify(tx, {
        entityType: 'transport_unit',
        entityId: truck.id,
        body:
          `יחידת הובלה שוחררה — מס' רישוי ${truck.licensePlate}, ` +
          `התקבלו ${receivedCodes.length + surplusCodes.length} אריזות, ${missingText}, ${formatHe(releasedAt)}`,
      });

      return {
        transportUnit: await loadTransportUnitDTO(tx, truck.id),
        receivedCodes: receivedCodes.sort(),
        missingCodes: missingCodes.sort(),
        surplusCodes: surplusCodes.sort(),
      };
    },
    { timeout: 15_000 },
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/receive.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Create `src/app/api/transport-units/[id]/receive/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { idParamSchema, receiveSchema } from '@/lib/api/schemas';
import { receiveTransportUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return receiveTransportUnit(actor, idParamSchema.parse(id), receiveSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 7: Smoke-test**

```bash
curl -s -X POST localhost:3000/api/transport-units/1/receive -H 'Content-Type: application/json' -d '{"receivedCodes":["10001"],"surplusCodes":[]}'
```

Expected: `{"transportUnit":{...,"status":"released"},"receivedCodes":["10001"],"missingCodes":[...],"surplusCodes":[]}`.

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add -A && git commit -m "feat(lifecycle): receive a transport unit with missing and surplus handling"
```

---

### Task 7: Distribute a packing unit

**Files:**
- Create: `src/lib/lifecycle/distribute.ts`, `src/app/api/packing-units/[id]/distribute/route.ts`
- Modify: `src/lib/lifecycle/index.ts` (add `export * from './distribute';`)
- Test: `tests/lifecycle/distribute.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6; `DistributeReq`, `PackingUnitDTO` from `@/lib/contracts`.
- Produces: `distributePackingUnit(actor: Actor, packingUnitId: number, req: DistributeReq): Promise<PackingUnitDTO>`; `POST /api/packing-units/:id/distribute`.

- [ ] **Step 1: Write the failing test** — `tests/lifecycle/distribute.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { distributePackingUnit, getPackingUnitByCode, receiveTransportUnit } from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, DEFAULT_DEST, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('distribute a packing unit', () => {
  let fx: Fixture;
  let actor: Actor;
  let unitId: number;
  let laptopItemId: number;
  let monitorItemId: number;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
    const box = await packBox(actor, {
      roomId: fx.roomA,
      items: [
        { mappingReportId: fx.reports.laptop, quantity: 2 },
        { mappingReportId: fx.reports.monitor, quantity: 1 },
      ],
    });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [box.code!] });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [box.code!], surplusCodes: [] });
    const received = await getPackingUnitByCode(box.code!);
    unitId = received.id;
    laptopItemId = received.items.find((i) => i.name === 'מחשב נייד')!.id;
    monitorItemId = received.items.find((i) => i.name === 'מסך')!.id;
  });

  it('marks the box distributed when everything is handed over', async () => {
    const unit = await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 2 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(unit.status).toBe('distributed');
    expect(unit.items.every((i) => i.itemStatus === 'distributed')).toBe(true);
    expect(unit.items.map((i) => i.distributedQuantity)).toEqual([2, 1]);
    expect(await db.notification.count({ where: { entityType: 'packing_unit' } })).toBe(0);
  });

  it('marks a partial hand-over short, on the box and on the item, with an SMS', async () => {
    const unit = await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 1 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(unit.status).toBe('distributed_short');
    const laptop = unit.items.find((i) => i.id === laptopItemId)!;
    expect(laptop).toMatchObject({ itemStatus: 'short', distributedQuantity: 1 });
    expect(unit.items.find((i) => i.id === monitorItemId)!.itemStatus).toBe('distributed');

    const sms = await db.notification.findFirstOrThrow({ where: { entityType: 'packing_unit' } });
    expect(sms.body).toContain('פוזרה עם חוסר');
    expect(sms.body).toContain('מחשב נייד');
  });

  it('marks everything short when nothing is handed over', async () => {
    const unit = await distributePackingUnit(actor, unitId, { items: [], atRoom: DEFAULT_DEST.destRoom });
    expect(unit.status).toBe('distributed_short');
    expect(unit.items.every((i) => i.itemStatus === 'short')).toBe(true);
    expect(unit.items.every((i) => i.distributedQuantity === 0)).toBe(true);
    expect(await db.notification.count({ where: { entityType: 'packing_unit' } })).toBe(1);
  });

  it('records a wrong-room override in the event note', async () => {
    await distributePackingUnit(actor, unitId, {
      items: [
        { packingUnitItemId: laptopItemId, quantity: 2 },
        { packingUnitItemId: monitorItemId, quantity: 1 },
      ],
      atRoom: 'חדר 999',
    });
    const event = await db.statusEvent.findFirstOrThrow({
      where: { entityType: 'packing_unit', entityId: unitId, toStatus: 'distributed' },
    });
    expect(event.note).toContain('חדר 999');
    expect(event.note).toContain(DEFAULT_DEST.destRoom);
  });

  it('rejects more than the box holds', async () => {
    await expect(
      distributePackingUnit(actor, unitId, {
        items: [{ packingUnitItemId: laptopItemId, quantity: 3 }],
        atRoom: DEFAULT_DEST.destRoom,
      }),
    ).rejects.toMatchObject({
      code: 'QUANTITY_EXCEEDS_REMAINING',
      messageHe: 'הכמות עבור "מחשב נייד" גדולה מהמותר (2)',
    });
    expect((await db.packingUnit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('received');
  });

  it('rejects an item from another box', async () => {
    const other = await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] });
    const strayItem = (await db.packingUnitItem.findFirstOrThrow({ where: { packingUnitId: other.id } })).id;
    await expect(
      distributePackingUnit(actor, unitId, {
        items: [{ packingUnitItemId: strayItem, quantity: 1 }],
        atRoom: DEFAULT_DEST.destRoom,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a box that was never received', async () => {
    const closed = await packBox(actor, { roomId: fx.roomB, items: [{ mappingReportId: fx.reports.chair, quantity: 1 }] });
    await expect(
      distributePackingUnit(actor, closed.id, { items: [], atRoom: 'חדר 214' }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('takes a personal carton straight to distributed', async () => {
    const personal = await packBox(actor, { roomId: fx.roomA, type: 'personal_carton' });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [personal.code!], licensePlate: '77-777-77' });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [personal.code!], surplusCodes: [] });
    const unit = await distributePackingUnit(actor, personal.id, { items: [], atRoom: DEFAULT_DEST.destRoom });
    expect(unit.status).toBe('distributed');
    expect(unit.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lifecycle/distribute.test.ts`
Expected: FAIL — `distributePackingUnit is not a function`.

- [ ] **Step 3: Implement `src/lib/lifecycle/distribute.ts`**

```ts
import type { DistributeReq, ItemStatus, PackingUnitDTO, PackingUnitStatus } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import type { Actor } from '@/lib/session';
import { notify, recordEvent } from './events';
import { loadPackingUnitDTO } from './queries';
import { assertTransition } from './transitions';

/**
 * Spec §5.4. Sent once with the final set. Anything the distributor did not hand over ends
 * `short` with its shortfall recorded — an untouched item is a loss, not a success.
 */
export async function distributePackingUnit(
  actor: Actor,
  packingUnitId: number,
  req: DistributeReq,
): Promise<PackingUnitDTO> {
  return db.$transaction(
    async (tx) => {
      const unit = await tx.packingUnit.findUnique({
        where: { id: packingUnitId },
        include: { items: { include: { mappingReport: { include: { subCategory: true } } } } },
      });
      if (!unit) throw Errors.notFound('אריזה');
      // Both distributed and distributed_short leave `received`, so this rejects anything else.
      assertTransition('packing_unit', unit.status, 'distributed');

      const atRoom = req.atRoom.trim();
      // Spec §5.4: the distributor may override a destination mismatch; the override is logged.
      const note =
        unit.destRoom && atRoom !== unit.destRoom
          ? `פוזר בחדר ${atRoom} — לא תואם ליעד ${unit.destRoom}`
          : `פוזר בחדר ${atRoom}`;

      if (unit.type === 'personal_carton') {
        if (req.items.length > 0) throw Errors.validation('קרטון אישי אינו מכיל פריטים');
        await tx.packingUnit.update({ where: { id: unit.id }, data: { status: 'distributed' } });
        await recordEvent(tx, {
          entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: 'distributed',
          actorId: actor.id, note,
        });
        return loadPackingUnitDTO(tx, unit.id);
      }

      const byId = new Map(unit.items.map((i) => [i.id, i]));
      const asked = new Map<number, number>();
      for (const line of req.items) {
        const item = byId.get(line.packingUnitItemId);
        if (!item) throw Errors.notFound('פריט');
        if (asked.has(item.id)) throw Errors.validation('אותו פריט נבחר פעמיים');
        const max = item.quantity - item.distributedQuantity;
        if (line.quantity > max) throw Errors.quantityExceeds(item.mappingReport.subCategory.description, max);
        asked.set(item.id, line.quantity);
      }

      const shortages: string[] = [];
      for (const item of unit.items) {
        const distributed = item.distributedQuantity + (asked.get(item.id) ?? 0);
        const to: ItemStatus = distributed >= item.quantity ? 'distributed' : 'short';
        assertTransition('packing_unit_item', item.itemStatus, to);
        await tx.packingUnitItem.update({
          where: { id: item.id },
          data: { distributedQuantity: distributed, itemStatus: to },
        });
        await recordEvent(tx, {
          entityType: 'packing_unit_item', entityId: item.id, fromStatus: item.itemStatus, toStatus: to,
          actorId: actor.id, note,
        });
        if (to === 'short') {
          shortages.push(`${item.mappingReport.subCategory.description} (חסרים ${item.quantity - distributed})`);
        }
      }

      const to: PackingUnitStatus = shortages.length === 0 ? 'distributed' : 'distributed_short';
      assertTransition('packing_unit', unit.status, to);
      await tx.packingUnit.update({ where: { id: unit.id }, data: { status: to } });
      await recordEvent(tx, {
        entityType: 'packing_unit', entityId: unit.id, fromStatus: unit.status, toStatus: to,
        actorId: actor.id, note,
      });

      if (shortages.length > 0) {
        await notify(tx, {
          entityType: 'packing_unit',
          entityId: unit.id,
          body:
            `אריזה ${unit.code} פוזרה עם חוסר — יעד ${unit.destBuilding} / ${unit.destFloor} / ${unit.destRoom}, ` +
            `חוסרים: ${shortages.join(', ')}`,
        });
      }

      return loadPackingUnitDTO(tx, unit.id);
    },
    { timeout: 15_000 },
  );
}
```

- [ ] **Step 4: Export it** — add `export * from './distribute';` to `src/lib/lifecycle/index.ts`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lifecycle/distribute.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Create `src/app/api/packing-units/[id]/distribute/route.ts`**

```ts
import { handle } from '@/lib/api/respond';
import { distributeSchema, idParamSchema } from '@/lib/api/schemas';
import { distributePackingUnit } from '@/lib/lifecycle';
import { requireActor } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return distributePackingUnit(actor, idParamSchema.parse(id), distributeSchema.parse(await req.json()));
  });
}
```

- [ ] **Step 7: Smoke-test**

```bash
curl -s -X POST localhost:3000/api/packing-units/1/distribute -H 'Content-Type: application/json' -d '{"items":[{"packingUnitItemId":1,"quantity":1}],"atRoom":"חדר 214"}'
```

Expected: the box comes back `"distributed"` or `"distributed_short"` depending on the quantity you sent.

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit && npx vitest run tests/lifecycle && npm run build
git add -A && git commit -m "feat(lifecycle): distribute a packing unit with shortage handling"
```

---

### Task 8: End-to-end chain test → Checkpoint B

Proves the whole chain against a real database, and hands the rest of the team the helpers they need.

**Files:**
- Modify: `tests/helpers/chain.ts` (tidy into its final shape)
- Create: `tests/e2e/chain.test.ts`

**Interfaces:**
- Consumes: every action from Tasks 3–7.
- Produces: `tests/helpers/chain.ts` final export list — `actorOf`, `packBox`, `loadTruck`, `DEFAULT_DEST`, `PackBoxOptions`. Other people's plans may import these.

- [ ] **Step 1: Tidy `tests/helpers/chain.ts`**

It grew across Tasks 3, 5 and 6, each appending its own import block. Replace the whole file with this — same exports, same signatures, imports merged:

```ts
import type { PackingUnitDTO, PackingUnitType, Role, TransportUnitDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import {
  closePackingUnit, createTransportUnit, loadTransportUnit, openPackingUnit, setPackingUnitItems,
} from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';

export const DEFAULT_DEST = { destBuilding: 'בניין 7', destFloor: 'קומה 2', destRoom: 'חדר 214' };

/** Turns a fixture user id into the Actor every lifecycle action expects. */
export async function actorOf(userId: number): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}

export interface PackBoxOptions {
  roomId: number;
  items?: { mappingReportId: number; quantity: number }[];
  type?: PackingUnitType;
  dest?: { destBuilding: string; destFloor: string; destRoom: string };
}

/** Opens a box, fills it and closes it. Returns the closed box, code assigned. */
export async function packBox(actor: Actor, opts: PackBoxOptions): Promise<PackingUnitDTO> {
  const type = opts.type ?? 'professional_carton';
  const unit = await openPackingUnit(actor, { sourceRoomId: opts.roomId, type });
  if (type !== 'personal_carton') {
    await setPackingUnitItems(actor, unit.id, { items: opts.items ?? [] });
  }
  const { unit: closed } = await closePackingUnit(actor, unit.id, opts.dest ?? DEFAULT_DEST);
  return closed;
}

/** Creates a truck and sends it off with the given box codes. */
export async function loadTruck(
  actor: Actor,
  opts: { groupId: number; codes: string[]; licensePlate?: string },
): Promise<TransportUnitDTO> {
  const truck = await createTransportUnit(actor, {
    type: 'truck',
    licensePlate: opts.licensePlate ?? '12-345-67',
    groupId: opts.groupId,
  });
  return loadTransportUnit(actor, truck.id, { codes: opts.codes });
}
```

- [ ] **Step 2: Write the failing test** — `tests/e2e/chain.test.ts`

This is the demo script from spec §9, run against the test database.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  distributePackingUnit, getPackingUnitByCode, listPackableItems, receiveTransportUnit,
} from '@/lib/lifecycle';
import type { Actor } from '@/lib/session';
import { actorOf, DEFAULT_DEST, loadTruck, packBox } from '../helpers/chain';
import { resetDb, seedFixture, type Fixture } from '../helpers/db';

describe('the full evacuation chain', () => {
  let fx: Fixture;
  let actor: Actor;
  beforeEach(async () => {
    await resetDb();
    fx = await seedFixture();
    actor = await actorOf(fx.userId);
  });

  it('packs a room empty, loses one box in transit and distributes the other short', async () => {
    // 1. Pack: two boxes empty room A.
    const boxA = await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.laptop, quantity: 2 }] });
    const boxB = await packBox(actor, { roomId: fx.roomA, items: [{ mappingReportId: fx.reports.monitor, quantity: 1 }] });
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('closed');
    expect(await listPackableItems(fx.roomB)).toHaveLength(1); // room B is untouched

    // 2. Load: both boxes leave on one truck.
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [boxA.code!, boxB.code!] });
    expect(truck.status).toBe('in_transit');

    // 3. Receive: only box A comes off. Box B is missing, not forgotten.
    const received = await receiveTransportUnit(actor, truck.id, { receivedCodes: [boxA.code!], surplusCodes: [] });
    expect(received.missingCodes).toEqual([boxB.code]);
    expect((await getPackingUnitByCode(boxB.code!)).status).toBe('missing');

    // 4. Distribute: box A is handed over one laptop short.
    const toDistribute = await getPackingUnitByCode(boxA.code!);
    const distributed = await distributePackingUnit(actor, toDistribute.id, {
      items: [{ packingUnitItemId: toDistribute.items[0].id, quantity: 1 }],
      atRoom: DEFAULT_DEST.destRoom,
    });
    expect(distributed.status).toBe('distributed_short');
    expect(distributed.items[0]).toMatchObject({ itemStatus: 'short', distributedQuantity: 1 });

    // 5. Nothing is lost silently: every box ends in an explicit terminal status...
    const finalStatuses = (await db.packingUnit.findMany({ orderBy: { id: 'asc' } })).map((u) => u.status);
    expect(finalStatuses).toEqual(['distributed_short', 'missing']);

    // ...every item too...
    const itemStatuses = (await db.packingUnitItem.findMany({ orderBy: { id: 'asc' } })).map((i) => i.itemStatus);
    expect(itemStatuses.sort()).toEqual(['missing', 'short']);

    // ...and the commander can replay box B's whole life from the audit trail.
    const boxBEvents = await db.statusEvent.findMany({
      where: { entityType: 'packing_unit', entityId: (await getPackingUnitByCode(boxB.code!)).id },
      orderBy: { id: 'asc' },
    });
    expect(boxBEvents.map((e) => e.toStatus)).toEqual(['open', 'closed', 'in_transit', 'missing']);
    expect(boxBEvents.every((e) => e.actorId === fx.userId)).toBe(true);

    // 6. Three SMS rows reached the dashboard feed: loaded, released-with-a-missing-box, short.
    const sms = await db.notification.findMany({ orderBy: { id: 'asc' } });
    expect(sms).toHaveLength(3);
    expect(sms[0].body).toContain('הועמסה');
    expect(sms[1].body).toContain(boxB.code!);
    expect(sms[2].body).toContain('פוזרה עם חוסר');
  });

  it('carries a personal carton through the chain without items', async () => {
    const personal = await packBox(actor, { roomId: fx.roomA, type: 'personal_carton' });
    const truck = await loadTruck(actor, { groupId: fx.groupId, codes: [personal.code!] });
    await receiveTransportUnit(actor, truck.id, { receivedCodes: [personal.code!], surplusCodes: [] });
    const done = await distributePackingUnit(actor, personal.id, { items: [], atRoom: DEFAULT_DEST.destRoom });

    expect(done.status).toBe('distributed');
    expect(await db.packingUnitItem.count()).toBe(0);
    // A personal carton never closes its source room.
    expect((await db.room.findUniqueOrThrow({ where: { id: fx.roomA } })).status).toBe('packing');
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run tests/e2e/chain.test.ts`
Expected: PASS (2 tests). If it fails, the bug is real — fix the lifecycle module, not the test.

- [ ] **Step 4: Run everything**

Run: `npm test && npm run build`
Expected: every test file green, build succeeds.

- [ ] **Step 5: Commit, merge and announce Checkpoint B**

```bash
git add -A && git commit -m "test: end-to-end evacuation chain and shared chain helpers"
git checkout main && git pull && git merge --ff-only p2/transport && git push
```

Post in team chat: "Checkpoint B — every action route is on `main`. `POST /api/transport-units`, `POST /api/transport-units/:id/load`, `POST /api/transport-units/:id/receive`, `POST /api/packing-units/:id/distribute`, plus the pack routes from before. `tests/helpers/chain.ts` gives you `packBox`, `loadTruck` and `actorOf` if you need a box in a given state."

---

### Task 9: Integration support (H5 → H20)

You own the write path, so every "it says the box can't do that" report lands with you.

- [ ] **Step 1: When a teammate reports an error code**, ask for the exact `{ error, messageHe }` and the box code. Look up the box's `status_events` — the audit trail tells you what the box actually did, and usually shows the client sent the wrong stage.
- [ ] **Step 2: Add a regression test before fixing anything.** A bug the lifecycle allowed is a hole in the transition table or in a quantity guard; both are cheap to pin down in `tests/lifecycle/`.
- [ ] **Step 3: At Checkpoint C**, run `npm run demo:reset` on the deployed database and walk the demo script with the team. Watch the `notifications` table — three SMS rows is the signature of a correct run.
- [ ] **Step 4: Keep the shortcuts visible.** Before feature freeze, grep your own files (`grep -rn "TODO" src/lib/lifecycle`) and copy anything a judge might ask about into `docs/generated/notes.md` under a `## Known shortcuts` heading.

---

## Appendix: what P2 does NOT do

Named here so nobody waits on you for them.

- **Timeline and dashboard endpoints** (`GET /api/packing-units/:id/timeline`, `GET /api/dashboard`) belong to P5. They read `status_events` and `notifications`, which you write — keep event notes informative, that is the whole contract between you.
- **Any UI.** P3 builds the pack screens, P4 the scan/load/receive/distribute screens. If a screen needs a field the DTO lacks, that is a contracts change: ask P1.
- **Role enforcement.** Spec §2: the API does not check roles in the MVP. Do not add it.
- **Reopening or editing a closed box.** Out of scope (spec §1). `setPackingUnitItems` rejects it on purpose.
- **Schema changes.** `prisma/schema.prisma` is frozen and P1-owned.
