# RBAC Command Hierarchy — Design Spec

**Date:** 2026-09-23
**Status:** Approved for planning (pending user sign-off on this file)
**Owner:** solo build (post-hackathon-team session)

## 1. Problem

The system has a flat, per-user `role` field (`packer | transporter | unloader | distributor | commander`) that describes what operational task a user is doing right now. It has no concept of military rank or chain of command. We need a second, orthogonal axis: a 4-tier rank hierarchy (Unit Commander → Ra'an → Ramad → Soldier) that gates a "command view" — a scoped screen where a commander sees the status/activity of everyone below them in the chain — and that supports assigning/removing direct subordinates and promoting/demoting rank, without disturbing the existing operational `role` field or the existing global `/command` operations dashboard (P5, unrelated and unchanged).

## 2. Decisions (from brainstorming Q&A — binding for this spec)

| # | Question | Decision |
|---|---|---|
| 1 | Relation to existing `role` field | Orthogonal. `role` (packer/transporter/.../commander) is untouched and freely self-picked by anyone, any rank. |
| 2 | Who assigns a subordinate to a commander | Any user holding Commander Permission self-assigns (no separate admin approval step). |
| 3 | Scope vs. existing `Group` entity | Independent. The rank tree has no relationship to `Group`; a commander's subordinates can span any `Group`. |
| 4 | Visibility depth | Recursive. A commander's view is their full subtree (all descendants), not just direct reports — confirmed by "Ra'an has all of his ramads' data," which itself includes each ramad's soldiers. |
| 5 | Who grants rank (promotion) | Granted by a higher rank, not self-selected. |

## 3. Hierarchy & Roles

Four tiers, highest to lowest:

1. `unit_commander` — Unit Commander (מפקד יחידה)
2. `raan` — Department Head / Ra'an (רע"נ)
3. `ramad` — Section Head / Ramad (רמ"ד)
4. `soldier` — Soldier (חייל)

**Commander Permission** = holding any rank other than `soldier`. A soldier can never hold Commander Permission, never has subordinates, and is never the target of a rank grant that would give them subordinates without first being promoted off `soldier`.

## 4. Data Model

Additive changes to `prisma/schema.prisma`, on the existing `User` model:

```prisma
model User {
  // ...existing fields unchanged...

  /// soldier | ramad | raan | unit_commander
  rank         String   @default("soldier") @map("rank")
  commanderId  Int?     @map("commander_id")
  commander    User?    @relation("CommandChain", fields: [commanderId], references: [id])
  subordinates User[]   @relation("CommandChain")
}
```

- Self-referential tree: each user has at most one direct commander (`commanderId`).
- `rank` defaults to `soldier` for every newly created user — matches decision #5 (nobody self-promotes).
- No `groupId` constraint on the relation (decision #3).

**Bootstrap:** `prisma/seed.ts` (existing file) gains one seeded `unit_commander` so the promotion chain has a root in dev/demo. Everyone else starts as `soldier`. This is a `// TODO`-flagged hackathon shortcut — production would need a real bootstrap/admin path.

## 5. Contracts (`src/lib/contracts.ts`, additive)

```ts
export const RANKS = ['soldier', 'ramad', 'raan', 'unit_commander'] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LEVEL: Record<Rank, number> = {
  soldier: 0,
  ramad: 1,
  raan: 2,
  unit_commander: 3,
};

export interface SubordinateStatusDTO {
  id: number;
  name: string;
  email: string;
  rank: Rank;
  role: Role | null;
  lastActivityAt: string | null; // latest StatusEvent.at for this user, or null
  lastActivityLabel: string | null; // Hebrew label of that event, or null
}

export interface AssignSubordinateReq {
  subordinateId: number;
}
export interface SetRankReq {
  userId: number;
  rank: Rank;
}
```

`RANK_LABELS` (Hebrew) goes in `src/lib/labels.ts` next to `ROLE_LABELS`:

```ts
export const RANK_LABELS: Record<Rank, string> = {
  soldier: 'חייל',
  ramad: 'רמ"ד',
  raan: 'רע"נ',
  unit_commander: 'מפקד יחידה',
};
```

## 6. Authorization Layer (`src/lib/command.ts`, new file)

Pure/query functions, no HTTP concerns:

- `hasCommanderPermission(rank: Rank): boolean` — `rank !== 'soldier'`.
- `isAncestor(candidateAncestorId: number, userId: number): Promise<boolean>` — walks `commanderId` upward from `userId`; used as the cycle guard.
- `assignSubordinate(actorId: number, subordinateId: number): Promise<void>`
  - Reject if actor lacks Commander Permission.
  - Reject if `subordinateId === actorId`.
  - Reject if `isAncestor(subordinateId, actorId)` is true (assigning an ancestor as your own subordinate would create a cycle).
  - Set `subordinate.commanderId = actorId`. This overwrites any prior commander link — reassignment is allowed by design (decision #2: any commander can self-assign).
- `removeSubordinate(actorId: number, subordinateId: number): Promise<void>`
  - Reject unless `subordinate.commanderId === actorId` (must be a *direct* report; a Ra'an cannot directly unlink a Ramad's soldier).
  - Set `subordinate.commanderId = null`.
- `setRank(actorId: number, targetId: number, newRank: Rank): Promise<void>`
  - Reject if actor lacks Commander Permission.
  - Reject unless `targetId` is a descendant of `actorId` (walk down, or equivalently confirm `isAncestor(actorId, targetId)`).
  - Reject unless `RANK_LEVEL[newRank] < RANK_LEVEL[actor.rank]` — a commander can never promote someone to their own rank or higher. This is the sole escalation guard; there is no separate "who can promote to unit_commander" rule beyond it (only a `unit_commander` can promote up to `raan`, one tier below themselves).
  - If `newRank === 'soldier'`: cascade — every user whose `commanderId === targetId` gets `commanderId = null` (orphaned, not reassigned up the chain). This is the simplest MVP rule; reassigning orphans to the demoted user's own former commander is a documented alternative, not built now (`// TODO`).
- `getSubtreeIds(rootId: number): Promise<number[]>` — BFS/recursive walk down the `commanderId` reverse relation (`subordinates`), collecting every descendant id. Small dataset (hackathon scale) — plain iterative queries, no recursive SQL CTE needed. `// TODO: push into a recursive SQL query if this ever meets real data volume.`
- `getSubordinateStatuses(actorId: number): Promise<SubordinateStatusDTO[]>`
  - Reject if actor lacks Commander Permission.
  - `getSubtreeIds(actorId)`, then fetch each user plus their latest `StatusEvent` (by `actorId` on `StatusEvent`, most recent `at`), map to `SubordinateStatusDTO`.

## 7. API (`src/app/api/command/**`, new routes)

Every route calls `requireActor()` first, matching the existing project convention (`docs/generated/plan.md` §5.8). Errors reuse the existing `{ error: ErrorCode, messageHe: string }` shape via `handle()`.

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/command/subordinates` | `AssignSubordinateReq` → `204` |
| DELETE | `/api/command/subordinates/:id` | – → `204` |
| PATCH | `/api/command/rank` | `SetRankReq` → `204` |
| GET | `/api/command/subtree` | – → `SubordinateStatusDTO[]` |

`GET /api/command/subtree` returns `403`-equivalent (reuse `VALIDATION` or add a `FORBIDDEN` error code — implementer's call, ledgered) when the actor is a `soldier`; the "command tab" is hidden client-side for soldiers as the first line of defense, this is the server-side backstop.

## 8. UI

New tab/page, separate from the existing global `/command` dashboard (P5's `DashboardDTO` screen is untouched). Suggested route: `/command/team` or a "Team" tab inside the existing `/command` layout, visible only when `hasCommanderPermission(actor.rank)`. Shows the subtree list from `GET /api/command/subtree` with name, rank, role, last activity. Assign/remove-subordinate and promote/demote controls live here too — exact layout is an implementation-plan-level decision, not a spec-level one; follow `/design` tokens per CLAUDE.md.

## 9. Edge Cases & Validation (explicit, from the original requirements)

- **Circular reference**: `isAncestor()` check in `assignSubordinate` blocks A→B→A.
- **Soldier can never be a commander**: enforced by `hasCommanderPermission` gate on `assignSubordinate` (as actor) and `setRank` (as actor); a `soldier` is a legitimate *target* of `assignSubordinate` (they get a commander) but never a legitimate *actor*.
- **Rank downgrade to soldier**: cascades to orphan (not reassign) the demoted user's direct subordinates, per §6.
- **Self-assignment**: `subordinateId === actorId` rejected in `assignSubordinate`.
- **Indirect removal**: `removeSubordinate` only works on a direct report; removing a "grandchild" requires the direct commander to act, or a rank change.

## 10. Explicitly Out of Scope

- Reassigning orphaned subordinates up the chain on downgrade (documented alternative, not built).
- Any UI/API for the very first `unit_commander` bootstrap beyond the seed script.
- Group-scoped hierarchy constraints (decision #3 ruled this out).
- Rate limiting / audit trail on rank changes beyond what `StatusEvent`-style logging already exists for other entities (rank changes do **not** currently write to `StatusEvent` — that table's `entityType` enum is closed to `packing_unit | packing_unit_item | transport_unit | room`; extending it is additive but is an implementation-plan decision, not required by this spec since command visibility only needs *operational* status events, not rank-change history).

## 11. File Ownership / Coordination Notes

Following the project's existing ownership convention (`docs/generated/plan.md` §4), even though this is now solo work:

- `prisma/schema.prisma` — additive-only change to `User`, new migration.
- `src/lib/contracts.ts`, `src/lib/labels.ts` — additive-only (previously "frozen," owner P1; no team to announce to now, but keep the append-only discipline so nothing existing breaks).
- New files: `src/lib/command.ts`, `src/app/api/command/**`, `src/app/command/team/**` (or equivalent), `tests/command-hierarchy/**` (distinct from existing `tests/command/**` which is P5's dashboard tests — avoid collision).

## 12. Testing Plan (detail deferred to the implementation plan)

TDD per `superpowers:test-driven-development`. Coverage needed: cycle rejection, self-assignment rejection, soldier-cannot-be-actor rejection, promotion-level-guard rejection, downgrade-cascade orphaning, recursive subtree visibility (Ramad sees own soldiers; Ra'an sees those same soldiers transitively through their ramads; Unit Commander sees everyone), direct-only removal.
