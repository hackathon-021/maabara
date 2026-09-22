# South Operation — Entity Relationship Diagram

A complete map of the `moving_south_operation` database schema: every table, every column,
every key, and every relationship — both the ones enforced by the database and the ones that
exist only in application code.

**Source of truth:** the migrations under `server/migrations/` (the actual DDL) cross-checked
against the Sequelize models under `server/src/models/southOperation/` (what the application
believes the tables look like). Where the two disagree, this document says so explicitly —
see [Section 7](#7-where-the-code-and-the-database-disagree).

Companion document: [SOUTH_OPERATION_API.md](SOUTH_OPERATION_API.md) describes the endpoints
that read and write these tables.

---

## Table of contents

1. [The diagram](#1-the-diagram)
2. [Text diagram](#2-text-diagram)
3. [Table catalog](#3-table-catalog)
4. [Relationship catalog](#4-relationship-catalog)
5. [Keys, constraints and indexes](#5-keys-constraints-and-indexes)
6. [How records are actually created and destroyed](#6-how-records-are-actually-created-and-destroyed)
7. [Where the code and the database disagree](#7-where-the-code-and-the-database-disagree)
8. [Migration history](#8-migration-history)

---

## 1. The diagram

All nine tables live in the PostgreSQL schema `moving_south_operation`. The `users` table
shown at the bottom is **not** in this schema — it lives in the default (public) schema and is
referenced across the schema boundary by application code only.

```mermaid
erDiagram
    item_types {
        bigint id PK "identity"
        varchar_255 description "NOT NULL"
    }

    categories {
        bigint id PK "identity"
        varchar_255 description "NOT NULL"
        bigint item_type_id FK "nullable"
        boolean is_special "nullable, default false"
        boolean is_available "nullable, default true"
    }

    sub_categories {
        bigint id PK "identity"
        bigint category_id FK "NOT NULL"
        varchar_255 description "NOT NULL"
        boolean is_available "nullable, default true"
    }

    locations {
        bigint id PK "identity"
        varchar_255 description "NOT NULL"
        boolean is_available "nullable, default true"
    }

    groups {
        bigint id PK "identity, but app-assigned"
        varchar_255 contact_name "nullable"
        varchar_10 contact_phone "nullable"
        timestamptz created_on "nullable, default NOW()"
        varchar_10 created_by "nullable"
        boolean is_available "NOT NULL, default true"
    }

    rooms {
        bigint id PK "identity"
        bigint group_id FK "NOT NULL"
        bigint location_id FK "nullable"
        varchar_255 description "nullable"
        varchar_255 status "nullable"
        varchar_255 room_manager "nullable"
        timestamptz start_mapping_time "nullable"
        timestamptz end_mapping_time "nullable"
        boolean is_available "NOT NULL, default true"
    }

    mapping_reports {
        bigint id PK "identity"
        bigint room_id FK "NOT NULL"
        bigint sub_category_id FK "NOT NULL"
        varchar_10 reported_by "NOT NULL"
        timestamptz reported_on "NOT NULL, default NOW()"
        varchar_30 status "NOT NULL"
        varchar_255 description "nullable"
        decimal quantity "NOT NULL, default 0"
        varchar_255 serial "nullable"
        varchar_255 item_purpose "nullable"
        varchar_255 item_target "nullable"
        timestamptz expiration_date "nullable"
        boolean is_available "NOT NULL, default true"
    }

    user_group {
        varchar_10 identity_num PK "part 1 of composite PK"
        bigint group_id PK-FK "part 2 of composite PK"
        timestamptz assigned_on "nullable, default NOW()"
        varchar_10 assigned_by "nullable"
        boolean is_available "NOT NULL, default true"
    }

    group_codes {
        bigint id PK "identity"
        varchar_4 code "NOT NULL, not unique"
        varchar_10 identity_num "nullable"
        boolean is_available "NOT NULL, default true"
    }

    users {
        varchar identity_num PK "in the DEFAULT schema"
    }

    item_types     ||--o{ categories      : "classifies (nullable FK)"
    categories     ||--o{ sub_categories  : "contains"
    sub_categories ||--o{ mapping_reports : "is reported as"
    locations      ||--o{ rooms           : "houses (nullable FK)"
    groups         ||--o{ rooms           : "contains"
    rooms          ||--o{ mapping_reports : "is mapped by"
    groups         ||--o{ user_group      : "grants access via"
    users          ||--o{ user_group      : "is granted access via (NO DB FK)"
    group_codes    }o..o{ groups          : "seeds access to (NO DB FK, prefix match)"
```

**Reading the diagram**

- `||--o{` — one-to-many, enforced by a real foreign key in the database.
- `}o..o{` (dashed) — a *logical* relationship that exists in the business rules but has **no**
  foreign key behind it. Nothing stops the data from becoming inconsistent.
- `PK` marks the primary key, `FK` a foreign key, `PK-FK` a column that is both.
- Types are written with underscores (`varchar_255`) because the Mermaid renderer cannot handle
  parentheses in a type name. Read `varchar_255` as `VARCHAR(255)`.

---

## 2. Text diagram

For anyone reading this without a Mermaid renderer. Solid lines are real foreign keys;
dashed lines are application-only relationships.

```
                        ┌──────────────────┐
                        │   item_types     │
                        │  (reference data)│
                        └────────┬─────────┘
                                 │ 1
                                 │  item_type_id (nullable FK)
                                 │ 0..N
                        ┌────────┴─────────┐
                        │   categories     │
                        └────────┬─────────┘
                                 │ 1
                                 │  category_id (FK, required)
                                 │ 0..N
                        ┌────────┴─────────┐
                        │  sub_categories  │
                        └────────┬─────────┘
                                 │ 1
                                 │  sub_category_id (FK, required)
                                 │ 0..N
  ┌───────────────┐              │
  │   locations   │              │
  └───────┬───────┘              │
          │ 1                    │
          │ location_id          │
          │ (nullable FK)        │
          │ 0..N                 │
  ┌───────┴───────┐     1   0..N │
  │     rooms     ├──────────────┤
  └───────┬───────┘   room_id    │
          │ 0..N      (FK)       │
          │                ┌─────┴──────────┐
          │ group_id (FK)  │ mapping_reports│
          │ 1              └────────────────┘
  ┌───────┴───────┐
  │    groups     │
  └───────┬───────┘
          │ 1
          │ group_id (FK, half of composite PK)
          │ 0..N
  ┌───────┴───────┐
  │  user_group   │ ← ← ← ← ← ← ← ← ← ← ← ← ← ┐
  └───────────────┘   identity_num            ╎  no FK constraint,
                                              ╎  and a different schema
                                       ┌──────┴──────┐
                                       │    users    │
                                       │ (default    │
                                       │  schema)    │
                                       └─────────────┘

  ┌───────────────┐
  │  group_codes  │╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌> groups
  └───────────────┘   no FK at all.
                      `code` is matched against the TEXT PREFIX of `groups.id`,
                      and `identity_num` is copied into `user_group` when a
                      group is created. Entirely application logic.
```

---

## 3. Table catalog

Nine tables. Column types and nullability below are the **database** truth, taken from the
migrations. Where the Sequelize model declares something different, it is flagged inline and
listed again in [Section 7](#7-where-the-code-and-the-database-disagree).

---

### 3.1 `item_types`

Coarse equipment classification. Pure reference data — there is no API endpoint that writes to
this table, and no soft-delete column, so rows here are permanent.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | `GENERATED BY DEFAULT AS IDENTITY` |
| `description` | `VARCHAR(255)` | NOT NULL | — | | The type name |

- **Referenced by:** `categories.item_type_id`.
- **References:** nothing.
- **No `is_available` column** — this is the only table in the schema without one, so the
  soft-delete convention does not apply here.
- **Seeded** with two rows: `ציוד לוגיסטי` (logistics equipment) and `ציוד תקשובי`
  (communications equipment).

---

### 3.2 `categories`

Top level of the equipment tree.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | Sequence repaired by a later migration |
| `description` | `VARCHAR(255)` | NOT NULL | — | | Category name |
| `item_type_id` | `BIGINT` | **nullable** | — | **FK** → `item_types.id` | Constraint `item_type_id_fkey`, added separately |
| `is_special` | `BOOLEAN` | **nullable** | `false` | | Model declares this non-null |
| `is_available` | `BOOLEAN` | **nullable** | `true` | | Soft-delete flag; model declares non-null |

- **References:** `item_types` (optional).
- **Referenced by:** `sub_categories.category_id`.
- A category with `item_type_id = NULL` is legal and common.

---

### 3.3 `sub_categories`

Second level of the equipment tree. This is what a mapping report actually points at.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | |
| `category_id` | `BIGINT` | NOT NULL | — | **FK** → `categories.id` | Required — no orphans |
| `description` | `VARCHAR(255)` | NOT NULL | — | | Sub-category name |
| `is_available` | `BOOLEAN` | **nullable** | `true` | | Soft-delete flag |

- **References:** `categories`.
- **Referenced by:** `mapping_reports.sub_category_id`.
- **No unique constraint on `(category_id, description)`.** The application matches
  sub-categories by their description text when reconciling a category's sub-category list, so
  duplicate descriptions under one category will produce ambiguous behaviour. Nothing at the
  database level prevents them.

---

### 3.4 `locations`

Where a room physically sits. Reference data, but editable through the API by `SOUTH_ADMIN`.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | Sequence repaired by a later migration |
| `description` | `VARCHAR(255)` | NOT NULL | — | | Location name |
| `is_available` | `BOOLEAN` | **nullable** | `true` | | Added by a later migration |

- **References:** nothing.
- **Referenced by:** `rooms.location_id` (nullable).
- **Seeded** with ~80 rows naming buildings and floors.
- `is_available` was bolted on after the table was created, and the migration did not set
  `allowNull: false` — so unlike the other `is_available` columns in this schema, **this one is
  genuinely nullable**, and rows created before that migration may hold `NULL`. A `NULL` here is
  neither `true` nor `false`, so it is excluded by the `WHERE is_available = true` filter every
  read endpoint applies — such a location would silently vanish from the API.

---

### 3.5 `groups`

The main organisational unit. Everything operational is scoped by group.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | The identity default exists but is **never used** — see below |
| `contact_name` | `VARCHAR(255)` | **nullable** | — | | Point of contact |
| `contact_phone` | `VARCHAR(10)` | **nullable** | — | | Contact phone |
| `created_on` | `TIMESTAMP` | **nullable** | `NOW()` | | Model declares this a `STRING` |
| `created_by` | `VARCHAR(10)` | **nullable** | — | | Creator's identity number |
| `is_available` | `BOOLEAN` | NOT NULL | `true` | | Soft-delete flag |

- **References:** nothing.
- **Referenced by:** `rooms.group_id`, `user_group.group_id`.
- **The `id` is meaningful, not arbitrary.** Although the column is declared as an identity
  column, the application **always supplies the value explicitly** and the sequence is never
  advanced. The ID encodes the group code: the first group under code `1234` gets
  `1234001`, the next `1234002`, and so on. This is why `group_codes.code` can be matched
  against the text prefix of `groups.id`.
- **A `description` column existed here originally and was moved to `rooms`** by migration
  `20260214222412`. Anything reading an old dump will still see it on the group.

---

### 3.6 `rooms`

A physical space inside a group that gets mapped.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | |
| `group_id` | `BIGINT` | NOT NULL | — | **FK** → `groups.id` | Required |
| `location_id` | `BIGINT` | **nullable** | — | **FK** → `locations.id` | Optional |
| `description` | `VARCHAR(255)` | **nullable** | — | | Moved here from `groups` |
| `status` | `VARCHAR(255)` | **nullable** | — | | Free text; `waiting` / `inProgress` are the meaningful values |
| `room_manager` | `VARCHAR(255)` | **nullable** | — | | Person responsible |
| `start_mapping_time` | `TIMESTAMP` | **nullable** | — | | Stamped automatically on the first mapping report |
| `end_mapping_time` | `TIMESTAMP` | **nullable** | — | | Set by the client |
| `is_available` | `BOOLEAN` | NOT NULL | `true` | | Soft-delete flag |

- **References:** `groups` (required), `locations` (optional).
- **Referenced by:** `mapping_reports.room_id`.
- **`status` is not constrained** — no enum, no check constraint, no application-level
  validation. Any string up to 255 characters is accepted.
- A room can never be moved between groups through the API; `group_id` is not updatable.

---

### 3.7 `mapping_reports`

The operational payload: one row per counted item in a room.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | |
| `room_id` | `BIGINT` | NOT NULL | — | **FK** → `rooms.id` | Required |
| `sub_category_id` | `BIGINT` | **NOT NULL** | — | **FK** → `sub_categories.id` | Required at the DB level — but the API treats it as optional |
| `reported_by` | `VARCHAR(10)` | NOT NULL | — | | Identity number, set by the server |
| `reported_on` | `TIMESTAMP` | NOT NULL | `NOW()` | | Set by the server |
| `status` | **`VARCHAR(30)`** | NOT NULL | — | | Note the 30-char limit, not 255 |
| `description` | `VARCHAR(255)` | **nullable** | — | | Free-text notes |
| `quantity` | `DECIMAL` | NOT NULL | `0` | | Unconstrained precision and scale |
| `serial` | `VARCHAR(255)` | **nullable** | — | | Serial number |
| `item_purpose` | `VARCHAR(255)` | **nullable** | — | | |
| `item_target` | `VARCHAR(255)` | **nullable** | — | | |
| `expiration_date` | `TIMESTAMP` | **nullable** | — | | |
| `is_available` | `BOOLEAN` | NOT NULL | `true` | | Soft-delete flag |

- **References:** `rooms`, `sub_categories`.
- **Referenced by:** nothing. This is a leaf table.
- **Two traps here**, both covered in [Section 7](#7-where-the-code-and-the-database-disagree):
  `sub_category_id` is required by the database but optional everywhere in the application, and
  `status` is `VARCHAR(30)` while the model and the API validation both assume no practical limit.
- **There is no unique constraint of any kind.** The same item can be reported in the same room
  any number of times; deduplication, if wanted, is the client's problem.

---

### 3.8 `user_group`

The access-control join table. This single table drives every visibility rule in the module:
which groups a user can see, which rooms they can reach, and which mapping reports they can read.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `identity_num` | `VARCHAR(10)` | NOT NULL | — | **PK (part 1)** | Model declares this a `BIGINT` |
| `group_id` | `BIGINT` | NOT NULL | — | **PK (part 2)**, **FK** → `groups.id` | |
| `assigned_on` | `TIMESTAMP` | **nullable** | `NOW()` | | When access was granted |
| `assigned_by` | `VARCHAR(10)` | **nullable** | — | | Who granted it |
| `is_available` | `BOOLEAN` | NOT NULL | `true` | | Soft-delete flag |

- **References:** `groups` (real FK). `users` — **application only, no FK constraint.**
- **Referenced by:** nothing.
- **Composite primary key `(identity_num, group_id)`.** A person can hold at most one row per
  group. This is why revoking and re-granting access reuses the same row and flips
  `is_available` rather than inserting a new one, and why the original `assigned_on` survives a
  re-grant that was never revoked.
- **The link to `users` crosses a schema boundary.** The `users` table lives in the default
  (public) schema, not in `moving_south_operation`. The Sequelize model declares
  `@ForeignKey(() => User)`, but the migration creates no such constraint — so **the database
  will happily store an assignment for an identity number that does not exist**, and the API
  does not validate identity numbers either.

---

### 3.9 `group_codes`

Pre-registration: who should automatically get access to a group once someone creates it under
a given code. Completely disconnected from the rest of the schema at the database level.

| Column | Type | Null? | Default | Key | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | NOT NULL | identity | **PK** | Identity added by a later fix migration |
| `code` | `VARCHAR(4)` | NOT NULL | — | | **Not unique** |
| `identity_num` | `VARCHAR(10)` | **nullable** | — | | One person per row |
| `is_available` | `BOOLEAN` | NOT NULL | `true` | | Added by a later migration |

- **References:** nothing. **Referenced by:** nothing. **Zero foreign keys.**
- **One row per (code, person) pair.** A code with three people is three rows sharing the same
  `code` value. This is why `code` cannot be unique, and why the surrogate `id` is not a useful
  handle for "the code" as a business object — the API groups rows by `code` and reports the ID
  of whichever row it happened to see first.
- **The empty-string placeholder.** A code with nobody attached is stored as a single row with
  `identity_num = ''` — an empty string, *not* `NULL` — purely so the code continues to exist.
  The API filters these rows out of its responses. Note that the column is nullable, so `NULL`
  is also storable, but the application never writes one and does not handle it.
- **Seeded** with ~150 rows. The seed data uses four-character codes with leading zeros
  (`'0101'`, `'0102'`, …), which is exactly why group creation strips a leading zero before
  prefix-matching against the numeric `groups.id`.

---

## 4. Relationship catalog

Every relationship in the schema, in one table.

| # | From (child) | To (parent) | Column | Cardinality | Required? | Enforced by DB? | Constraint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `categories` | `item_types` | `item_type_id` | many → 1 | Optional | ✅ Yes | `item_type_id_fkey` |
| 2 | `sub_categories` | `categories` | `category_id` | many → 1 | Required | ✅ Yes | auto-named |
| 3 | `mapping_reports` | `sub_categories` | `sub_category_id` | many → 1 | Required | ✅ Yes | auto-named |
| 4 | `rooms` | `groups` | `group_id` | many → 1 | Required | ✅ Yes | auto-named |
| 5 | `rooms` | `locations` | `location_id` | many → 1 | Optional | ✅ Yes | auto-named |
| 6 | `mapping_reports` | `rooms` | `room_id` | many → 1 | Required | ✅ Yes | auto-named |
| 7 | `user_group` | `groups` | `group_id` | many → 1 | Required | ✅ Yes | auto-named |
| 8 | `user_group` | `users` *(other schema)* | `identity_num` | many → 1 | Required by intent | ❌ **No** | — |
| 9 | `group_codes` | `groups` | `code` ↔ prefix of `id` | many ↔ many | Neither | ❌ **No** | — |

### Derived many-to-many

- **`users` ↔ `groups` through `user_group`.** The Sequelize `Group` model declares
  `@BelongsToMany(() => User, () => UserGroup)` and exposes it as `permittedUsers`. Only the
  `groups` side of that join is backed by a real foreign key.

### The two unenforced relationships, in detail

**#8 — `user_group.identity_num` → `users.identity_num`**

The model says it is a foreign key; the database does not. The reason is almost certainly the
schema boundary — `user_group` lives in `moving_south_operation` while `users` does not, and the
migration simply never created the cross-schema constraint. Consequences:

- Access can be granted to an identity number that has never logged in and may not exist.
- Deleting a user leaves orphaned assignment rows behind, invisibly.
- The type also disagrees: `VARCHAR(10)` here, `VARCHAR` (max 9 by validator) on `users`.

**#9 — `group_codes.code` → `groups.id`**

This is not a key relationship at all; it is a *string prefix* relationship computed at runtime:

```sql
-- roughly what the application does when checking whether a code is in use
WHERE CAST(groups.id AS TEXT) LIKE '<code without leading zero>%'
  AND groups.is_available = true
```

Consequences worth knowing:

- Nothing prevents a group from being created under a code that was never registered — you
  simply end up with a group only its creator can see.
- The prefix match has no boundary: code `12` matches group `1234001`, which actually belongs
  to code `1234`. Deleting the short code will be blocked by the long code's groups.
- The leading-zero handling is asymmetric. Group creation strips a leading zero before searching
  for the highest existing ID, but looks up pre-registered users with the code **exactly as
  submitted**. Sending `0101` versus `101` therefore takes different paths through the same
  request.

---

## 5. Keys, constraints and indexes

### Primary keys

| Table | Primary key | Generated how |
| --- | --- | --- |
| `item_types` | `id` | `GENERATED BY DEFAULT AS IDENTITY` |
| `categories` | `id` | Identity (re-created by a fix migration) |
| `sub_categories` | `id` | Identity |
| `locations` | `id` | Identity (re-created by a fix migration) |
| `groups` | `id` | Identity **declared but unused** — the application always supplies the value |
| `rooms` | `id` | Identity |
| `mapping_reports` | `id` | Identity |
| `group_codes` | `id` | Identity (re-created by a fix migration) |
| `user_group` | **`(identity_num, group_id)`** | Natural composite key, no surrogate |

`GENERATED BY DEFAULT AS IDENTITY` (rather than `ALWAYS`) means an explicit value can be
inserted without error. That is exactly what `groups` relies on — and it is also why three
tables needed `setval` fix migrations after seed data was loaded with hard-coded IDs: the
sequence had not advanced past the seeded rows, so the next real insert collided.

### Unique constraints

**There are none** beyond the primary keys. In particular:

- `group_codes.code` is deliberately non-unique (one row per person).
- `sub_categories (category_id, description)` is not unique, despite the application treating
  description as the matching key when reconciling a category's sub-category list.
- `locations.description` is not unique — the API creates duplicates happily.
- `item_types.description` is not unique.

### Check constraints

**None.** `rooms.status` and `mapping_reports.status` are free text, `mapping_reports.quantity`
is an unconstrained `DECIMAL` with no non-negative check, and no `is_available` column has a
`NOT NULL` check where the migration did not already declare one.

### Indexes

**No secondary indexes are created anywhere in this schema.** Only the primary keys are indexed,
plus whatever indexes PostgreSQL creates implicitly for them. Note that PostgreSQL does **not**
automatically index foreign key columns.

This matters because the hot query paths all filter on unindexed columns:

| Query the API runs constantly | Filters on | Indexed? |
| --- | --- | --- |
| Every single read in the module | `is_available` | ❌ |
| List rooms for a group | `rooms.group_id`, `rooms.is_available` | ❌ |
| List reports for a room | `mapping_reports.room_id` | ❌ |
| Compute a user's allowed groups | `user_group.identity_num`, `user_group.is_available` | Partially — `identity_num` is the leading column of the composite PK, so this one is covered |
| Look up a group code | `group_codes.code` | ❌ |
| Check whether a sub-category is in use | `mapping_reports.sub_category_id` | ❌ |

The `user_group` lookup by `identity_num` is the one that gets a free ride, because it is the
**leading** column of the composite primary key. A lookup by `group_id` alone — which the API
does whenever it lists the members of a group — does **not** benefit from that index.

### Referential actions

None of the foreign keys declare `ON DELETE` or `ON UPDATE`, so they all fall back to
PostgreSQL's default of `NO ACTION`. In practice this never fires, because **the application
never issues a `DELETE`** — see the next section.

---

## 6. How records are actually created and destroyed

### Nothing is ever deleted

Every table except `item_types` carries an `is_available` boolean, and every "delete" in the
application is an `UPDATE ... SET is_available = false`. There is not a single `DELETE`
statement in the South Operation controllers. Consequences that follow directly from the schema:

- **IDs are never reused.** A soft-deleted group still occupies its ID, and because group ID
  generation searches for the highest existing ID *including* soft-deleted rows, the next group
  under that code gets a fresh number.
- **`ON DELETE CASCADE` would be meaningless**, which is presumably why none of the foreign keys
  declare referential actions.
- **Cascading is done in application code instead.** Deleting a group loops over its rooms and
  its user assignments and flips each one. Deleting a category loops over its sub-categories.
  Nothing at the database level guarantees these cascades run, or completes them if a request
  fails partway — though each cascade is wrapped in a transaction.
- **Uniqueness collides with soft deletion.** Because a soft-deleted row still physically exists,
  re-creating "the same" record usually means **reactivating** the old row. This is exactly what
  `group_codes` and `user_group` do. Old relationships can therefore come back to life along with
  the row.

### Referential integrity is defended before the write, not by the database

Because the foreign keys have no referential actions, the application guards deletions itself.
Four such guards exist, and each one blocks a soft-delete when a dependent row is still live:

| Deleting | Is blocked when | Error message |
| --- | --- | --- |
| a category | any live mapping report points at one of its sub-categories | `קיימים מיפויים המשויכים לקטגוריה הזו` |
| a sub-category (via category reconciliation) | any live mapping report points at it | `קיימים מיפויים המשויכים לתת הקטגוריות שאתה מנסה למחוק` |
| a location | any live room sits at it | `קיימים חדרים עם המיקום` |
| a group | any live mapping report exists in any of its rooms | `קיימים מיפויים המקושרים לקבוצה` |
| a room | any live mapping report exists in it | `קיימים מיפויים המקושרים לחדר` |

Note what these guards check: **live** dependents only. A soft-deleted mapping report does not
block anything, so it is entirely possible to end up with a soft-deleted report pointing at a
soft-deleted sub-category — the foreign key is still satisfied, since the row physically exists.

### Writes are transactional, reads are not

Every write path wraps its work — the business row, the user-action audit entry, and the export
queue entry — in a single transaction. So the audit trail cannot drift out of sync with the data.

The one exception is the location delete, which runs **without** a transaction and writes no
audit entry at all.

---

## 7. Where the code and the database disagree

These are places where the Sequelize model declares something different from what the migration
actually created. The database always wins at runtime, so each of these is a latent surprise.

| # | Table | Column | Migration (DB truth) | Model declares | What this means in practice |
| --- | --- | --- | --- | --- | --- |
| 1 | `groups` | `id` | `BIGINT`, identity | `DataType.STRING`, no `@AutoIncrement` | Mostly harmless because the app always supplies the ID, but it means the identity sequence never advances. If anything ever *did* insert without an ID, it would start from 1 and collide. |
| 2 | `groups` | `created_on` | `TIMESTAMP`, default `NOW()` | `DataType.STRING` | The app writes an ISO string, PostgreSQL casts it to a timestamp, and reads it back as a JS Date — which the model then types as a string. Values round-trip, but the TypeScript type is a lie. |
| 3 | `user_group` | `identity_num` | `VARCHAR(10)` | `DataType.BIGINT` | Identity numbers with leading zeros are stored correctly (the column is text) but the model type suggests otherwise. Comparisons in application code are string comparisons. |
| 4 | `mapping_reports` | `sub_category_id` | **`NOT NULL`** | `subCategoryId?: string` (optional), and the API explicitly permits a report with no sub-category | **This is the sharpest edge in the schema.** `POST /mappingReport` validates the sub-category only *if one was supplied*, so the application believes a report without one is legal — but the insert will be rejected by the database with a not-null violation, surfacing as a `500`. |
| 5 | `mapping_reports` | `status` | **`VARCHAR(30)`** | `DataType.STRING` (255), and the API applies no length validation at all | A status string longer than 30 characters passes every application check and then fails at the database. |
| 6 | `locations` | `is_available` | nullable (the `addColumn` migration omitted `allowNull: false`) | `allowNull: false` | Rows predating the migration may hold `NULL`, which is excluded by `WHERE is_available = true` — such a location disappears from the API without being "deleted". |
| 7 | `categories` | `is_special`, `is_available` | nullable, with defaults | non-null in the model interface | Same class of problem: a `NULL` `is_available` makes the category invisible to every read. |
| 8 | `categories` | `is_special` | default `false` | required in `CategoryCreationAttrs` | `PATCH /categories` writes `undefined` when the field is omitted, which persists as `NULL` rather than reverting to the default. |
| 9 | `rooms` | `location_id` | nullable | `locationId: string` (non-optional in the interface) | A room with no location is legal in the database and will typecheck as a non-null string in application code. |
| 10 | `groups` | `contact_name` | nullable | `contactName: string` (non-optional) | Same pattern. |
| 11 | `user_group` | `identity_num` → `users` | **no FK constraint** | `@ForeignKey(() => User)` | Orphaned assignments are storable and undetectable. The API does not validate identity numbers either. |
| 12 | `group_codes` | `identity_num` | nullable | `identityNum: string` (non-optional) | The application writes `''` rather than `NULL` for the placeholder row, so the nullable case never arises in practice — but a `NULL` written by hand would not be filtered out by the `identityNum !== ''` checks the controllers use. |

### A note on how the foreign keys were declared

Most of the `references` blocks in the create-table migrations name the parent table without a
schema qualifier — `references: { model: 'categories', key: 'id' }` — while the table being
created *is* schema-qualified. Only the `categories.item_type_id` constraint, added later in its
own migration, spells out `{ schema: 'moving_south_operation', tableName: 'item_types' }`
explicitly. The unqualified references resolve through the connection's `search_path` at
migration time. They evidently resolved correctly when the migrations were run, but it is worth
knowing that the resolution was implicit rather than pinned, if these migrations are ever
replayed against a database with a different `search_path`.

---

## 8. Migration history

The whole schema was created in a single session on 2026-02-12, followed by a series of
corrections. Reading these in order explains most of the oddities above.

| Migration | What it did |
| --- | --- |
| `20260212150108-add-new-moving-south-schema` | Created the `moving_south_operation` schema |
| `20260212150720-create-categories-moving-south` | `categories` |
| `20260212151507-create-sub-categories-moving-south` | `sub_categories`, with its FK to `categories` |
| `20260212152947-create-stations-moving-south` | `groups` — note the filename still says "stations", the old name for this entity, which survives in some Hebrew error messages (`לא קיימת תחנה`) |
| `20260212203259-create-item-types-moving-south` | `item_types` |
| `20260212203505-create-locations-moving-south` | `locations` — **without** `is_available` |
| `20260212204506-create-rooms-moving-south` | `rooms`, with FKs to `groups` and `locations` |
| `20260212211549-create-group_codes-moving-south` | `group_codes` — **without** `is_available` |
| `20260212213428-create-user-group-moving-south` | `user_group`, composite PK, FK to `groups` only |
| `20260212213844-create-mapping-reports-moving-south` | `mapping_reports`, with FKs to `rooms` and `sub_categories` |
| `20260212215323-update-constraint-for-item-types` | Added `item_type_id_fkey` on `categories` — the only explicitly schema-qualified FK |
| `20260214222412-move-description-to-room-from-group` | Dropped `groups.description`, added `rooms.description` |
| `20260225152714-add-is-available-to-group-codes` | Added `group_codes.is_available` as `NOT NULL DEFAULT true` |
| `20260226000000-fix-group-codes-id-to-autoincrement` | Rebuilt `group_codes.id` as an identity column and advanced the sequence past the seeded rows |
| `20260226120000-fix-locations-id-sequence` | Same fix for `locations.id` |
| `20260304135501-copy-return-op-data` | Backfilled data from the return-operation schema |
| `20260305152255-add-is-available-to-locations` | Added `locations.is_available` — **omitting `allowNull: false`**, which is why this one column is nullable |
| `20260317162000-fix-categories-id-sequence-moving-south` | Same identity-sequence fix for `categories.id` |

The three `fix-…-id-sequence` migrations all exist for the same reason: seed data was inserted
with hard-coded IDs, which does not advance an identity sequence, so the next application insert
tried to reuse ID 1. Each fix rebuilds the identity column and calls `setval` past the current
maximum. If new seed data is ever added with explicit IDs, the same fix will be needed again.
