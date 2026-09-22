# HaMa'abara MVP — Design Spec

**Date:** 2026-09-22
**Status:** Approved design, pending implementation plan
**Scope:** Hackathon MVP (~24h, 1–2 developers) covering Phase B end to end: packing → loading/transport → receiving → distribution, plus a live commander dashboard.

Sources consulted: `/flows` (all four), `/personas` (packer, transporter, unloader, distributor, inspector), `/wiki` (ERD + API of the existing Phase A mapping system), `/design`.

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Codebase | Standalone app in this repo. Mirrors the conventions of the existing `southOperation` schema/API but does not depend on that server. |
| Stack | Next.js (TypeScript, App Router) + Prisma + Postgres. Single app serves field UI, dashboard and API. |
| Hosting | Deployed with HTTPS (Vercel + Neon Postgres, or Render). HTTPS is required for phone camera access. |
| Auth | Google sign-in via Auth.js. Any Google account may sign in and freely pick any role; role can be switched from the header at any time. No allowlist. `// TODO: real role assignment` |
| Box identity | Server-assigned unique 5-digit code, encoded as a QR label (printable or shown on screen). Camera scanning (`html5-qrcode`) with manual 5-digit entry as fallback. |
| Live updates | Dashboard polls every ~3s. No WebSockets. |
| SMS | Mocked: written to a `notifications` table and shown as a feed on the dashboard. |
| Out of scope | Offline mode, real SMS, editing/reopening closed boxes, GPS truck tracking, UI tests. |

## 2. Architecture

```
Next.js app
├── /field        mobile, Hebrew RTL; 4 actions: pack / load / receive / distribute
├── /command      commander dashboard (desktop layout), polls GET /api/dashboard
├── /api/*        thin route handlers → lifecycle module
├── lib/lifecycle the ONLY code that changes statuses; one DB transaction per action;
│                 writes status_events + notifications
└── Auth.js       Google provider; creates `users` row on first sign-in, then role picker
```

Roles: `packer`, `transporter`, `unloader`, `distributor`, `commander`. Roles only gate which home actions are shown; the API does not enforce role checks in the MVP (`// TODO`).

UI follows `/design`: primary `#5F42FF`, white rounded cards, pill buttons, Hebrew sans-serif (Heebo/Rubik/Assistant), RTL throughout. Field screens use oversized touch targets.

## 3. Data model

### Mirrored from the existing ERD (seeded with realistic Hebrew demo data)

Same table and column names as `/wiki/maabara_ERD.md`, soft delete via `is_available`, identity numbers stored as strings.

- `groups`, `rooms`, `locations`, `categories`, `sub_categories`
- `mapping_reports` — one row per mapped item in a source room: `room_id`, `sub_category_id`, `quantity`, `serial`, `description`, `status` ∈ {`transfer` (עובר), `salvage` (הנצלה), `disposal` (גריטה)}
- `rooms.status` extended with Phase B values: `packing`, `closed` (חדר סגור), `awaiting_disposal` (ממתין לגריטה)

### New Phase B tables

**`users`** — `id`, `email` (unique), `name`, `role`, `identity_num` (nullable), `created_at`

**`packing_units`**
- `id`, `code` (CHAR(5), unique, server-assigned on close)
- `type` ∈ {`professional_carton`, `personal_carton`, `pallet`, `trolley`, `loose`}
- `source_room_id` → `rooms`
- `dest_building`, `dest_floor`, `dest_room`
- `status` (see §4)
- `transport_unit_id` → `transport_units` (nullable)
- `packed_by` → `users`, `opened_at`, `closed_at`

**`packing_unit_items`** — `id`, `packing_unit_id`, `mapping_report_id`, `quantity`, `distributed_quantity` (default 0), `item_status` ∈ {`packed`, `received`, `distributed`, `missing`, `short`}. A personal carton has no rows.

**`transport_units`** — `id`, `type` ∈ {`truck`, `other`}, `type_details` (nullable), `license_plate`, `group_id`, `status`, `created_by`, `created_at`, `departed_at`, `released_at`

**`status_events`** (append-only audit trail) — `id`, `entity_type` ∈ {`packing_unit`, `packing_unit_item`, `transport_unit`, `room`}, `entity_id`, `from_status`, `to_status`, `actor_id`, `at`, `note`

**`notifications`** — `id`, `channel` (`sms`), `recipients` (text), `body` (Hebrew), `entity_type`, `entity_id`, `created_at`

### Zero-loss invariants

1. `remaining(mapping_report) = quantity − Σ packing_unit_items.quantity` over non-personal units. Packing more than remaining is rejected.
2. A room becomes `closed` / `awaiting_disposal` only when remaining = 0 for all its `transfer`/`salvage` items (server-computed; the client never decides).
3. Every box and item that does not complete the chain ends in an explicit `missing` or `short` status with an event and a notification — never silently dropped.
4. Every status change writes a `status_events` row in the same transaction.

## 4. Lifecycle

**Packing unit:**
`open` (אריזה בתהליך) → `closed` (אריזה נסגרה) → `in_transit` (אריזה בדרך) → `received` (אריזה התקבלה) | `missing` (אריזה חסרה)
`received` → `distributed` (פוזרה) | `distributed_short` (פוזרה עם חוסר)

**Transport unit:** `loading` → `in_transit` → `released`. On receive, events are written for both "fully unloaded" and "released" within the same action.

**Item (`packing_unit_items.item_status`):** `packed` → `received` | `missing` → `distributed` | `short`

Any transition not listed is rejected by the lifecycle module.

## 5. Flows and API

All endpoints return JSON; errors are `{ error: <code>, messageHe: <string> }` with 4xx status.

### 5.1 Pack (packer)
1. Pick group → room. Unmapped room → error "יש לסיים את המיפוי".
2. Choose unit type → `POST /api/packing-units { sourceRoomId, type }` → `open`.
3. Pick items (non-personal only): list of `transfer`/`salvage` items with remaining > 0, sorted A–Z, quantity steppers → `PUT /api/packing-units/:id/items { items: [{ mappingReportId, quantity }] }`.
4. Enter destination → `POST /api/packing-units/:id/close { destBuilding, destFloor, destRoom }` → `closed`, code assigned, items `packed`.
5. Response includes the label data (code, destination, source room, packer) and room check result `{ remaining, disposalRemaining, roomStatus }`. UI shows the QR label, then "continue packing / pause". Personal carton skips step 3 and the room check.

### 5.2 Load (transporter)
1. `POST /api/transport-units { type, typeDetails?, licensePlate, groupId }` → `loading`.
2. Scan boxes (or tick from list of `closed` boxes); client accumulates codes.
3. `POST /api/transport-units/:id/load { codes: [] }` → boxes `in_transit`, truck `in_transit`, `departed_at` set, SMS notification ("יחידת הובלה הועמסה": plate, box count, time).
4. UI: "continue loading?" → new truck or home.

### 5.3 Receive (unloader)
1. Pick a truck from those `in_transit`.
2. Scan boxes as they come off; live counter "7/9". Scanning a box not on this truck → prompt "עודף — לקבל בכל זאת?"; if confirmed it is included as surplus (event note `surplus`).
3. The client shows the recheck step before submitting: if any boxes are unconfirmed, warning "שים לב, לא כל האריזות נפרקו" and a list of them to recheck.
4. `POST /api/transport-units/:id/receive { receivedCodes: [], surplusCodes: [] }` — sent once with the final set. Unconfirmed boxes → `missing`, their items → `missing`.
5. Received boxes → `received`, items → `received`; truck → `released`; SMS with summary including missing boxes.

### 5.4 Distribute (distributor)
1. Scan box (must be `received`) → show destination and contents.
2. Wrong-room guard: distributor confirms the room they are standing in; mismatch with the box destination → warning (can override, logged as event note).
3. Tick items with quantities. If anything is not fully distributed, the client shows "שים לב, לא כל הפריטים פוזרו" and a recheck list before submitting.
4. `POST /api/packing-units/:id/distribute { items: [{ packingUnitItemId, quantity }], atRoom }` — sent once with the final set. All fully distributed → box `distributed`, items `distributed`. Otherwise box `distributed_short`, shortfall items `short`, SMS with the missing items.
5. Personal carton → straight to `distributed`.

### 5.5 Field UX rules
- Every screen shows one clear "next step" prompt.
- Oversized buttons; audio + vibration on scan success/failure.
- Re-scanning an already-counted box is a friendly no-op.

### 5.6 Lookup endpoints
`GET /api/groups`, `GET /api/rooms?groupId=`, `GET /api/rooms/:id/packable-items`, `GET /api/packing-units?status=`, `GET /api/packing-units/by-code/:code`, `GET /api/transport-units?status=`, `GET /api/packing-units/:id/timeline`.

## 6. Commander dashboard (`/command`)

Single `GET /api/dashboard`, polled every ~3s.

- **KPI tiles:** items packed / in transit / received / distributed vs. total mapped; missing and short counts in red.
- **Source rooms grid:** status + packed-vs-mapped progress bar; click → boxes in that room.
- **Trucks:** loading / in transit / released with box count, plate, departure time.
- **Exceptions panel:** every `missing` box and `short` item, with last actor and last known status from `status_events`.
- **SMS feed:** mocked notifications, newest first.
- **Box search:** code → full event timeline.

## 7. Error handling

The lifecycle module throws typed errors: `ILLEGAL_TRANSITION`, `NOT_ON_THIS_TRUCK`, `QUANTITY_EXCEEDS_REMAINING`, `ROOM_NOT_MAPPED`, `NOT_FOUND`. Route handlers map them to 4xx with a Hebrew `messageHe`; the field app shows it with the error sound. Unexpected errors → 500 with a generic Hebrew message.

## 8. Testing

- **Vitest unit tests on `lib/lifecycle`:** every legal transition passes and illegal ones are rejected; quantity accounting and room closure; missing path on receive; short path on distribute; personal carton shortcuts; `status_events` written for every change.
- **One end-to-end script:** a single box through all four stages against a test database.
- No UI tests.

## 9. Demo script (seeded)

1. Pack two boxes in room 101 → room closes.
2. Load both on a truck → dashboard updates live.
3. Receive only one → missing-box alert + SMS in the feed.
4. Distribute the received box with one item short → exception on the dashboard.
5. Search the missing box's code → full timeline.
