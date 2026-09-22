# HaMa'abara MVP — Master Implementation Plan (team of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each person's plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, demoable Phase B system (pack → load → receive → distribute + live commander dashboard) in ~24h with five people working in parallel.

**Architecture:** One Next.js (App Router, TypeScript) app with Prisma/Postgres. All status changes go through `src/lib/lifecycle` (one transaction per action, append-only `status_events`). Field UI at `/field`, dashboard at `/command`, JSON API at `/api/*`. Parallel work is made possible by the **frozen contracts** in §5 — everyone codes against them from hour 1.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Prisma 6 + PostgreSQL, Auth.js v5 (`next-auth@beta`, Google provider), zod, SWR, `qrcode.react`, `html5-qrcode`, Vitest 3.

**Spec:** `docs/generated/2026-09-22-mvp-design.md` — every person reads it before starting.

## Global Constraints

- Hackathon MVP: prefer quick and demoable; mark every shortcut with `// TODO:` and a reason.
- Code, identifiers, comments: English. All user-facing copy: Hebrew. Whole UI is RTL (`<html lang="he" dir="rtl">`).
- UI follows `/design/design.md`: primary `#5F42FF`, active chip bg `#D7D0FF`, page bg `#665FB3`, surface `#FFFFFF`, border `#E5E5EA`, link `#005DF5`, text `#1A1A1A`; pill primary buttons; white cards radius 16–20px; font Heebo.
- Only `src/lib/lifecycle/**` may write `status` columns, `status_events`, or `notifications`. Everything else reads. (Exception: P1's seed/test helpers.)
- Every status change writes a `status_events` row in the same transaction.
- API errors are always `{ error: ErrorCode, messageHe: string }` with a 4xx/5xx status (via `src/lib/api/respond.ts`).
- Box codes are exactly 5 digits (`/^\d{5}$/`), unique, assigned by the server on close. QR payload = the bare 5-digit code.
- Dashboard polls every 3000 ms. No WebSockets.
- SMS is mocked: rows in `notifications`, never a real send.
- Out of scope: offline mode, real SMS, editing/reopening closed boxes, GPS, UI tests.

---

## 1. Team split

| Person | Workstream | Plan file | Depends on |
|---|---|---|---|
| **P1** | Platform & data: scaffold, frozen contracts, Prisma schema, seed, lookups, Google auth, deploy, integration captain | `plans/p1-platform.md` | — |
| **P2** | Lifecycle core: state machine, all write actions, action API routes, lifecycle tests, e2e chain test | `plans/p2-lifecycle.md` | P1 Checkpoint A |
| **P3** | Field shell & design system: tokens, UI kit, field home, **Pack** flow, QR label | `plans/p3-field-pack.md` | Checkpoint A; P2 pack routes to wire up |
| **P4** | Scanning & chain flows: scanner, **Load**, **Receive**, **Distribute** | `plans/p4-field-scan-flows.md` | Checkpoint A; P3 UI kit (~H4); P2 routes |
| **P5** | Commander dashboard: dashboard + timeline read models, `/command` UI | `plans/p5-command-dashboard.md` | Checkpoint A |

## 2. Timeline & checkpoints (H = hours from kickoff)

| When | What | Who |
|---|---|---|
| H0–H1 | P1 does Tasks 1–3 (scaffold, contracts, schema, seed, test helpers) and pushes to `main` = **Checkpoint A**. Meanwhile everyone installs Node 20+, Docker (or creates a personal Neon DB), reads the spec + their plan. P1 also creates the Google OAuth client and Neon project and shares credentials. | all |
| H1 | **Checkpoint A** — everyone pulls `main`, `npm i`, sets up `.env` + `.env.test`, runs migrations, `npm test` is green. | all |
| H1–H5 | Parallel build. UI people build screens against lookups + seed data; action calls get wired as routes land. | all |
| ~H4 | P3 merges UI kit (`src/components/ui/*`, `src/lib/feedback.ts`) — P4 switches to it. | P3 |
| H5 | **Checkpoint B** — all P2 action routes + `tests/helpers/chain.ts` on `main`; P1 auth on `main`. | P1, P2 |
| H5–H12 | Wire end to end. P1 deploys first build at ~H6 and redeploys on every merge (Vercel auto-deploy). | all |
| H12 | **Checkpoint C** — the full demo script (§7) runs on the deployed URL on real phones. | P1 leads |
| H12–H20 | Bug fixes, UX polish, Hebrew copy review, dashboard polish. | all |
| H20 | **Feature freeze.** Fixes only. | all |
| H20–H24 | Demo rehearsal ×3 (`npm run demo:reset` between runs), print QR labels, record a backup video. | all |

## 3. Git workflow

- Branch per person per task: `p<N>/<short-topic>` (e.g. `p2/receive`). Small PRs into `main`; merge yourself once `npm test` and `npm run build` pass — no review gate, but post the PR link in team chat.
- Rebase on `main` at least hourly.
- **File ownership (§4) is how we avoid conflicts.** Don't edit files you don't own; ask the owner.
- **Frozen files** (`src/lib/contracts.ts`, `src/lib/labels.ts`, `src/lib/errors.ts`, `src/lib/api/respond.ts`, `src/lib/api/client.ts`, `prisma/schema.prisma`) change only via P1 after announcing in chat. Additive changes only unless the whole team agrees.

## 4. File ownership map

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts,
.env.example, .gitignore                                   P1
prisma/schema.prisma, prisma/migrations/**                 P1 (frozen)
prisma/seed.ts                                             P1
src/lib/db.ts                                              P1
src/lib/contracts.ts, src/lib/labels.ts, src/lib/errors.ts P1 (frozen)
src/lib/api/respond.ts, src/lib/api/client.ts              P1 (frozen)
src/lib/session.ts, src/lib/users.ts, src/lib/lookups.ts   P1
src/auth.ts, src/types/next-auth.d.ts                      P1
src/app/api/auth/[...nextauth]/route.ts                    P1
src/app/api/me/route.ts, src/app/api/me/role/route.ts      P1
src/app/api/groups/route.ts, src/app/api/rooms/route.ts    P1
src/app/login/page.tsx, src/app/role/page.tsx              P1
src/components/RoleSwitcher.tsx                            P1
src/app/page.tsx                                           P1 (redirect only)
tests/setup.ts, tests/helpers/db.ts, tests/lib/**          P1

src/lib/lifecycle/**                                       P2
src/lib/api/schemas.ts                                     P2
src/app/api/rooms/[id]/packable-items/route.ts             P2
src/app/api/packing-units/route.ts                         P2
src/app/api/packing-units/by-code/[code]/route.ts          P2
src/app/api/packing-units/[id]/items/route.ts              P2
src/app/api/packing-units/[id]/close/route.ts              P2
src/app/api/packing-units/[id]/distribute/route.ts         P2
src/app/api/transport-units/route.ts                       P2
src/app/api/transport-units/[id]/load/route.ts             P2
src/app/api/transport-units/[id]/receive/route.ts          P2
tests/lifecycle/**, tests/helpers/chain.ts, tests/e2e/**   P2

src/app/layout.tsx, src/app/globals.css                    P3 (P1 leaves scaffold defaults)
src/components/ui/**, src/lib/feedback.ts                  P3
src/components/QrLabel.tsx                                 P3
src/app/field/layout.tsx, src/app/field/page.tsx           P3
src/app/field/pack/**, tests/field/pack/**                 P3

src/components/Scanner.tsx, src/components/ScanOrType.tsx  P4
src/lib/scan-session.ts                                    P4
src/app/field/load/**, src/app/field/receive/**            P4
src/app/field/distribute/**                                P4
tests/field/scan/**, tests/field/distribute/**             P4

src/lib/dashboard.ts, src/lib/timeline.ts                  P5
src/app/api/dashboard/route.ts                             P5
src/app/api/packing-units/[id]/timeline/route.ts           P5
src/app/command/**, src/components/command/**              P5
tests/command/**                                           P5
```

## 5. Frozen contracts

P1 commits these **verbatim** in P1 Tasks 1–2. Everyone imports them; nobody redefines these types locally.

### 5.1 `src/lib/contracts.ts`

```ts
// Frozen shared contracts. Owner: P1. Additive changes only, announced in team chat.

export const ROLES = ['packer', 'transporter', 'unloader', 'distributor', 'commander'] as const;
export type Role = (typeof ROLES)[number];

export const PACKING_UNIT_TYPES = ['professional_carton', 'personal_carton', 'pallet', 'trolley', 'loose'] as const;
export type PackingUnitType = (typeof PACKING_UNIT_TYPES)[number];

export const PACKING_UNIT_STATUSES = [
  'open', 'closed', 'in_transit', 'received', 'missing', 'distributed', 'distributed_short',
] as const;
export type PackingUnitStatus = (typeof PACKING_UNIT_STATUSES)[number];

export const ITEM_STATUSES = ['packed', 'received', 'distributed', 'missing', 'short'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const TRANSPORT_TYPES = ['truck', 'other'] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_STATUSES = ['loading', 'in_transit', 'released'] as const;
export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export const MAPPING_STATUSES = ['transfer', 'salvage', 'disposal'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const ROOM_STATUSES = ['waiting', 'inProgress', 'done', 'packing', 'closed', 'awaiting_disposal'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Rooms in these statuses finished Phase A mapping and may be packed. */
export const PACKABLE_ROOM_STATUSES: readonly RoomStatus[] = ['done', 'packing'];

export const ENTITY_TYPES = ['packing_unit', 'packing_unit_item', 'transport_unit', 'room'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const BOX_CODE_RE = /^\d{5}$/;

export type ErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'NOT_ON_THIS_TRUCK'
  | 'QUANTITY_EXCEEDS_REMAINING'
  | 'ROOM_NOT_MAPPED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'INTERNAL';

export interface ApiError {
  error: ErrorCode;
  messageHe: string;
}

// ---------- DTOs (all dates are ISO strings) ----------

export interface MeDTO {
  id: number;
  email: string;
  name: string;
  role: Role | null;
}

export interface GroupDTO {
  id: number;
  name: string;
}

export interface RoomDTO {
  id: number;
  groupId: number;
  description: string;
  status: RoomStatus;
  roomManager: string | null;
}

export interface PackableItemDTO {
  mappingReportId: number;
  name: string;
  serial: string | null;
  status: 'transfer' | 'salvage';
  remaining: number;
}

export interface PackingUnitItemDTO {
  id: number;
  mappingReportId: number;
  name: string;
  serial: string | null;
  quantity: number;
  distributedQuantity: number;
  itemStatus: ItemStatus;
}

export interface PackingUnitSummaryDTO {
  id: number;
  code: string | null;
  type: PackingUnitType;
  status: PackingUnitStatus;
  sourceRoomName: string;
  destBuilding: string | null;
  destFloor: string | null;
  destRoom: string | null;
}

export interface PackingUnitDTO extends PackingUnitSummaryDTO {
  sourceRoomId: number;
  groupName: string;
  roomManager: string | null;
  transportUnitId: number | null;
  packedByName: string;
  closedAt: string | null;
  items: PackingUnitItemDTO[];
}

export interface RoomCheckDTO {
  remaining: number;
  disposalRemaining: number;
  roomStatus: RoomStatus;
}

export interface ClosePackingUnitResult {
  unit: PackingUnitDTO;
  /** null for personal cartons (no room check). */
  roomCheck: RoomCheckDTO | null;
}

export interface TransportUnitDTO {
  id: number;
  type: TransportType;
  typeDetails: string | null;
  licensePlate: string;
  groupId: number;
  status: TransportStatus;
  createdAt: string;
  departedAt: string | null;
  releasedAt: string | null;
  boxes: PackingUnitSummaryDTO[];
}

export interface ReceiveResult {
  transportUnit: TransportUnitDTO;
  receivedCodes: string[];
  missingCodes: string[];
  surplusCodes: string[];
}

export interface TimelineEventDTO {
  id: number;
  at: string;
  entityType: EntityType;
  entityId: number;
  fromStatus: string | null;
  toStatus: string;
  /** Hebrew, human-readable, e.g. 'פריט "מחשב נייד": פריט נארז' */
  label: string;
  actorName: string;
  note: string | null;
}

export interface DashboardDTO {
  generatedAt: string;
  kpis: {
    totalMapped: number;
    packed: number;
    inTransit: number;
    received: number;
    distributed: number;
    missing: number;
    short: number;
  };
  boxCounts: Record<PackingUnitStatus, number>;
  rooms: {
    id: number;
    groupName: string;
    description: string;
    status: RoomStatus;
    mappedQty: number;
    packedQty: number;
  }[];
  trucks: {
    id: number;
    licensePlate: string;
    type: TransportType;
    status: TransportStatus;
    boxCount: number;
    departedAt: string | null;
  }[];
  exceptions: {
    kind: 'missing_box' | 'short_item';
    packingUnitId: number;
    packingUnitCode: string | null;
    description: string;
    lastActorName: string;
    at: string;
  }[];
  notifications: {
    id: number;
    body: string;
    recipients: string;
    createdAt: string;
  }[];
}

// ---------- Requests ----------

export interface OpenPackingUnitReq {
  sourceRoomId: number;
  type: PackingUnitType;
}
export interface SetItemsReq {
  items: { mappingReportId: number; quantity: number }[];
}
export interface ClosePackingUnitReq {
  destBuilding: string;
  destFloor: string;
  destRoom: string;
}
export interface CreateTransportReq {
  type: TransportType;
  typeDetails?: string;
  licensePlate: string;
  groupId: number;
}
export interface LoadReq {
  codes: string[];
}
export interface ReceiveReq {
  receivedCodes: string[];
  surplusCodes: string[];
}
export interface DistributeReq {
  items: { packingUnitItemId: number; quantity: number }[];
  atRoom: string;
}
export interface SetRoleReq {
  role: Role;
}
```

### 5.2 `src/lib/labels.ts`

```ts
import type {
  ItemStatus, MappingStatus, PackingUnitStatus, PackingUnitType, Role, RoomStatus,
  TransportStatus, TransportType,
} from './contracts';

export const ROLE_LABELS: Record<Role, string> = {
  packer: 'אורז',
  transporter: 'מוביל',
  unloader: 'פורק',
  distributor: 'מפזר',
  commander: 'מפקד',
};

export const PACKING_UNIT_TYPE_LABELS: Record<PackingUnitType, string> = {
  professional_carton: 'קרטון מקצועי',
  personal_carton: 'קרטון אישי',
  pallet: 'משטח',
  trolley: 'דולב',
  loose: 'תפזורת',
};

export const PACKING_UNIT_STATUS_LABELS: Record<PackingUnitStatus, string> = {
  open: 'אריזה בתהליך',
  closed: 'אריזה נסגרה',
  in_transit: 'אריזה בדרך',
  received: 'אריזה התקבלה',
  missing: 'אריזה חסרה',
  distributed: 'אריזה פוזרה',
  distributed_short: 'אריזה פוזרה עם חוסר',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  packed: 'פריט נארז',
  received: 'פריט התקבל',
  distributed: 'פריט פוזר',
  missing: 'פריט חסר',
  short: 'פריט בחוסר',
};

export const TRANSPORT_TYPE_LABELS: Record<TransportType, string> = {
  truck: 'משאית',
  other: 'אחר',
};

export const TRANSPORT_STATUS_LABELS: Record<TransportStatus, string> = {
  loading: 'בתהליך העמסה',
  in_transit: 'יחידת הובלה בדרך',
  released: 'יחידת הובלה שוחררה',
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  waiting: 'ממתין למיפוי',
  inProgress: 'במיפוי',
  done: 'מופה',
  packing: 'באריזה',
  closed: 'חדר סגור',
  awaiting_disposal: 'ממתין לגריטה',
};

export const MAPPING_STATUS_LABELS: Record<MappingStatus, string> = {
  transfer: 'עובר',
  salvage: 'הנצלה',
  disposal: 'גריטה',
};

/** Hebrew label for a status string of a known entity type ('unloaded' is a transport pseudo-status). */
export function statusLabel(entityType: string, status: string | null): string {
  if (status === null) return '—';
  const maps: Record<string, Record<string, string>> = {
    packing_unit: PACKING_UNIT_STATUS_LABELS,
    packing_unit_item: ITEM_STATUS_LABELS,
    transport_unit: { ...TRANSPORT_STATUS_LABELS, unloaded: 'יחידת הובלה נפרקה במלואה' },
    room: ROOM_STATUS_LABELS,
  };
  return maps[entityType]?.[status] ?? status;
}
```

### 5.3 `src/lib/errors.ts`

```ts
import type { ErrorCode } from './contracts';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly messageHe: string,
    public readonly status: number,
  ) {
    super(`${code}: ${messageHe}`);
  }
}

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
};
```

### 5.4 `src/lib/api/respond.ts`

```ts
import { ZodError } from 'zod';
import type { ApiError } from '@/lib/contracts';
import { AppError } from '@/lib/errors';

/** Wraps a route handler body: JSON on success, the standard error body on failure. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof AppError) {
      const body: ApiError = { error: e.code, messageHe: e.messageHe };
      return Response.json(body, { status: e.status });
    }
    if (e instanceof ZodError) {
      const body: ApiError = { error: 'VALIDATION', messageHe: 'נתונים חסרים או שגויים' };
      return Response.json(body, { status: 400 });
    }
    console.error(e);
    const body: ApiError = { error: 'INTERNAL', messageHe: 'אירעה שגיאה, נסו שוב' };
    return Response.json(body, { status: 500 });
  }
}
```

### 5.5 `src/lib/api/client.ts` (browser-side typed client — UI code calls only this)

```ts
import type {
  ApiError, ClosePackingUnitReq, ClosePackingUnitResult, CreateTransportReq, DashboardDTO,
  DistributeReq, ErrorCode, GroupDTO, LoadReq, MeDTO, OpenPackingUnitReq, PackableItemDTO,
  PackingUnitDTO, PackingUnitStatus, PackingUnitSummaryDTO, ReceiveReq, ReceiveResult, Role,
  RoomDTO, SetItemsReq, TimelineEventDTO, TransportStatus, TransportUnitDTO,
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

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
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

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const api = {
  me: () => call<MeDTO>('GET', '/api/me'),
  setRole: (role: Role) => call<MeDTO>('POST', '/api/me/role', { role }),

  groups: () => call<GroupDTO[]>('GET', '/api/groups'),
  rooms: (groupId: number) => call<RoomDTO[]>('GET', `/api/rooms${qs({ groupId })}`),
  packableItems: (roomId: number) => call<PackableItemDTO[]>('GET', `/api/rooms/${roomId}/packable-items`),

  packingUnits: (filter: { status?: PackingUnitStatus; roomId?: number } = {}) =>
    call<PackingUnitSummaryDTO[]>('GET', `/api/packing-units${qs(filter)}`),
  packingUnitByCode: (code: string) =>
    call<PackingUnitDTO>('GET', `/api/packing-units/by-code/${encodeURIComponent(code)}`),
  openPackingUnit: (req: OpenPackingUnitReq) => call<PackingUnitDTO>('POST', '/api/packing-units', req),
  setPackingUnitItems: (id: number, req: SetItemsReq) =>
    call<PackingUnitDTO>('PUT', `/api/packing-units/${id}/items`, req),
  closePackingUnit: (id: number, req: ClosePackingUnitReq) =>
    call<ClosePackingUnitResult>('POST', `/api/packing-units/${id}/close`, req),
  distributePackingUnit: (id: number, req: DistributeReq) =>
    call<PackingUnitDTO>('POST', `/api/packing-units/${id}/distribute`, req),

  transportUnits: (status?: TransportStatus) =>
    call<TransportUnitDTO[]>('GET', `/api/transport-units${qs({ status })}`),
  createTransportUnit: (req: CreateTransportReq) => call<TransportUnitDTO>('POST', '/api/transport-units', req),
  loadTransportUnit: (id: number, req: LoadReq) =>
    call<TransportUnitDTO>('POST', `/api/transport-units/${id}/load`, req),
  receiveTransportUnit: (id: number, req: ReceiveReq) =>
    call<ReceiveResult>('POST', `/api/transport-units/${id}/receive`, req),

  timeline: (packingUnitId: number) =>
    call<TimelineEventDTO[]>('GET', `/api/packing-units/${packingUnitId}/timeline`),
  dashboard: () => call<DashboardDTO>('GET', '/api/dashboard'),
};
```

### 5.6 `src/lib/session.ts` — signatures (stub in P1 Task 2, real in P1 Task 5)

```ts
export interface Actor { id: number; name: string; email: string; role: Role | null }
/** For API routes: the signed-in user, or throws Errors.unauthenticated(). */
export async function requireActor(): Promise<Actor>;
/** For server pages/layouts: the user; redirects to /login (no session) or /role (no role). */
export async function requirePageActor(): Promise<Actor>;
```

### 5.7 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Mirrored from /wiki/maabara_ERD.md (Phase A) ----------
// TODO: item_types, user_group, group_codes omitted — not needed for the Phase B demo.

model Group {
  id             Int             @id @default(autoincrement())
  name           String
  isAvailable    Boolean         @default(true) @map("is_available")
  rooms          Room[]
  transportUnits TransportUnit[]

  @@map("groups")
}

model Location {
  id          Int     @id @default(autoincrement())
  name        String
  isAvailable Boolean @default(true) @map("is_available")
  rooms       Room[]

  @@map("locations")
}

model Category {
  id            Int           @id @default(autoincrement())
  description   String
  isAvailable   Boolean       @default(true) @map("is_available")
  subCategories SubCategory[]

  @@map("categories")
}

model SubCategory {
  id             Int             @id @default(autoincrement())
  categoryId     Int             @map("category_id")
  category       Category        @relation(fields: [categoryId], references: [id])
  description    String
  isAvailable    Boolean         @default(true) @map("is_available")
  mappingReports MappingReport[]

  @@map("sub_categories")
}

model Room {
  id               Int             @id @default(autoincrement())
  groupId          Int             @map("group_id")
  group            Group           @relation(fields: [groupId], references: [id])
  locationId       Int?            @map("location_id")
  location         Location?       @relation(fields: [locationId], references: [id])
  description      String
  /// waiting | inProgress | done | packing | closed | awaiting_disposal
  status           String          @default("waiting")
  roomManager      String?         @map("room_manager")
  startMappingTime DateTime?       @map("start_mapping_time")
  endMappingTime   DateTime?       @map("end_mapping_time")
  isAvailable      Boolean         @default(true) @map("is_available")
  mappingReports   MappingReport[]
  packingUnits     PackingUnit[]

  @@map("rooms")
}

model MappingReport {
  id               Int               @id @default(autoincrement())
  roomId           Int               @map("room_id")
  room             Room              @relation(fields: [roomId], references: [id])
  subCategoryId    Int               @map("sub_category_id")
  subCategory      SubCategory       @relation(fields: [subCategoryId], references: [id])
  reportedBy       String            @map("reported_by") @db.VarChar(10)
  reportedOn       DateTime          @default(now()) @map("reported_on")
  /// transfer | salvage | disposal
  status           String            @db.VarChar(30)
  description      String?
  /// TODO: ERD uses DECIMAL; Int is enough for the demo.
  quantity         Int               @default(0)
  serial           String?
  isAvailable      Boolean           @default(true) @map("is_available")
  packingUnitItems PackingUnitItem[]

  @@map("mapping_reports")
}

// ---------- New for Phase B ----------

model User {
  id                Int             @id @default(autoincrement())
  email             String          @unique
  name              String
  /// packer | transporter | unloader | distributor | commander (null until picked)
  role              String?
  identityNum       String?         @map("identity_num") @db.VarChar(10)
  createdAt         DateTime        @default(now()) @map("created_at")
  packedUnits       PackingUnit[]   @relation("PackedBy")
  createdTransports TransportUnit[] @relation("CreatedBy")
  events            StatusEvent[]

  @@map("users")
}

model PackingUnit {
  id              Int               @id @default(autoincrement())
  code            String?           @unique @db.Char(5)
  /// professional_carton | personal_carton | pallet | trolley | loose
  type            String
  /// open | closed | in_transit | received | missing | distributed | distributed_short
  status          String            @default("open")
  sourceRoomId    Int               @map("source_room_id")
  sourceRoom      Room              @relation(fields: [sourceRoomId], references: [id])
  destBuilding    String?           @map("dest_building")
  destFloor       String?           @map("dest_floor")
  destRoom        String?           @map("dest_room")
  transportUnitId Int?              @map("transport_unit_id")
  transportUnit   TransportUnit?    @relation(fields: [transportUnitId], references: [id])
  packedById      Int               @map("packed_by")
  packedBy        User              @relation("PackedBy", fields: [packedById], references: [id])
  openedAt        DateTime          @default(now()) @map("opened_at")
  closedAt        DateTime?         @map("closed_at")
  items           PackingUnitItem[]

  @@index([status])
  @@index([sourceRoomId])
  @@map("packing_units")
}

model PackingUnitItem {
  id                  Int           @id @default(autoincrement())
  packingUnitId       Int           @map("packing_unit_id")
  packingUnit         PackingUnit   @relation(fields: [packingUnitId], references: [id], onDelete: Cascade)
  mappingReportId     Int           @map("mapping_report_id")
  mappingReport       MappingReport @relation(fields: [mappingReportId], references: [id])
  quantity            Int
  distributedQuantity Int           @default(0) @map("distributed_quantity")
  /// packed | received | distributed | missing | short
  itemStatus          String        @default("packed") @map("item_status")

  @@unique([packingUnitId, mappingReportId])
  @@map("packing_unit_items")
}

model TransportUnit {
  id           Int           @id @default(autoincrement())
  /// truck | other
  type         String
  typeDetails  String?       @map("type_details")
  licensePlate String        @map("license_plate")
  groupId      Int           @map("group_id")
  group        Group         @relation(fields: [groupId], references: [id])
  /// loading | in_transit | released
  status       String        @default("loading")
  createdById  Int           @map("created_by")
  createdBy    User          @relation("CreatedBy", fields: [createdById], references: [id])
  createdAt    DateTime      @default(now()) @map("created_at")
  departedAt   DateTime?     @map("departed_at")
  releasedAt   DateTime?     @map("released_at")
  packingUnits PackingUnit[]

  @@map("transport_units")
}

/// Append-only audit trail. Never updated or deleted.
model StatusEvent {
  id         Int      @id @default(autoincrement())
  /// packing_unit | packing_unit_item | transport_unit | room
  entityType String   @map("entity_type")
  entityId   Int      @map("entity_id")
  fromStatus String?  @map("from_status")
  toStatus   String   @map("to_status")
  actorId    Int      @map("actor_id")
  actor      User     @relation(fields: [actorId], references: [id])
  at         DateTime @default(now())
  note       String?

  @@index([entityType, entityId])
  @@map("status_events")
}

/// Mocked SMS outbox, shown on the dashboard.
model Notification {
  id         Int      @id @default(autoincrement())
  channel    String   @default("sms")
  recipients String
  body       String
  entityType String   @map("entity_type")
  entityId   Int      @map("entity_id")
  createdAt  DateTime @default(now()) @map("created_at")

  @@map("notifications")
}
```

### 5.8 API route table

| Method | Path | Body → Response | Owner |
|---|---|---|---|
| GET | `/api/me` | – → `MeDTO` | P1 |
| POST | `/api/me/role` | `SetRoleReq` → `MeDTO` | P1 |
| GET | `/api/groups` | – → `GroupDTO[]` | P1 |
| GET | `/api/rooms?groupId=` | – → `RoomDTO[]` | P1 |
| GET | `/api/rooms/:id/packable-items` | – → `PackableItemDTO[]` | P2 |
| GET | `/api/packing-units?status=&roomId=` | – → `PackingUnitSummaryDTO[]` | P2 |
| POST | `/api/packing-units` | `OpenPackingUnitReq` → `PackingUnitDTO` | P2 |
| GET | `/api/packing-units/by-code/:code` | – → `PackingUnitDTO` | P2 |
| PUT | `/api/packing-units/:id/items` | `SetItemsReq` → `PackingUnitDTO` | P2 |
| POST | `/api/packing-units/:id/close` | `ClosePackingUnitReq` → `ClosePackingUnitResult` | P2 |
| POST | `/api/packing-units/:id/distribute` | `DistributeReq` → `PackingUnitDTO` | P2 |
| GET | `/api/transport-units?status=` | – → `TransportUnitDTO[]` | P2 |
| POST | `/api/transport-units` | `CreateTransportReq` → `TransportUnitDTO` | P2 |
| POST | `/api/transport-units/:id/load` | `LoadReq` → `TransportUnitDTO` | P2 |
| POST | `/api/transport-units/:id/receive` | `ReceiveReq` → `ReceiveResult` | P2 |
| GET | `/api/packing-units/:id/timeline` | – → `TimelineEventDTO[]` | P5 |
| GET | `/api/dashboard` | – → `DashboardDTO` | P5 |

Every route calls `requireActor()` first. Next.js 15 route params are async: `{ params }: { params: Promise<{ id: string }> }`.

## 6. Shared test infrastructure (P1 delivers at Checkpoint A)

- `npm test` = `vitest run`. Tests use the database in `.env.test` — **never** the dev DB, because tests truncate every table.
- `tests/helpers/db.ts` exports `resetDb()` and `seedFixture(): Promise<Fixture>`:

```ts
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
```

- P2 adds `tests/helpers/chain.ts` (`packBox`, `loadTruck`) at Checkpoint B.

## 7. Integration & demo (owner: P1, everyone participates)

At Checkpoint C and during rehearsal, run spec §9 on the deployed URL:

1. Packer (phone 1): pack two boxes in room 101 → the second close shows "חדר סגור".
2. Transporter (phone 2): new truck, scan both labels, finish loading → dashboard truck row + SMS.
3. Unloader (phone 3): receive the truck, scan only one label → warning → finish → dashboard missing box + SMS.
4. Distributor (phone 4): scan the received box, confirm the right room, leave one item unticked → shortage → dashboard exception + SMS.
5. Commander (laptop): search the missing box's code → full timeline.

`npm run demo:reset` restores the seed between runs.
