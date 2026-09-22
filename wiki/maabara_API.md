# South Operation API — Full Reference Guide

A plain-English description of every model and every endpoint under `southOperation`.
This is meant to be read by a person, not parsed by a tool. It explains what each
endpoint expects, what it actually does behind the scenes, and what comes back.

**Source of truth:** `server/src/models/southOperation/`, `server/src/routes/southOperation/`,
`server/src/controllers/southOperation/`.

---

## Table of contents

1. [How to read this document](#1-how-to-read-this-document)
2. [Things that are true for every endpoint](#2-things-that-are-true-for-every-endpoint)
3. [The data model, in words](#3-the-data-model-in-words)
4. [ItemType — equipment types](#4-itemtype--equipment-types)
5. [Category — equipment categories](#5-category--equipment-categories)
6. [SubCategory — equipment sub-categories](#6-subcategory--equipment-sub-categories)
7. [Location — physical locations](#7-location--physical-locations)
8. [GroupCodes — group code allocations](#8-groupcodes--group-code-allocations)
9. [Group — groups (units/stations)](#9-group--groups-unitsstations)
10. [UserGroup — who is allowed into which group](#10-usergroup--who-is-allowed-into-which-group)
11. [Room — rooms inside a group](#11-room--rooms-inside-a-group)
12. [MappingReport — the actual mapping records](#12-mappingreport--the-actual-mapping-records)
13. [Appendix A — role codes](#appendix-a--role-codes)
14. [Appendix B — known quirks and gotchas](#appendix-b--known-quirks-and-gotchas)

---

## 1. How to read this document

Every endpoint below is written in the same shape:

- **What it does** — the business meaning, in one or two sentences.
- **Who can call it** — the roles the route requires.
- **Input** — URL parameters, query string, and/or JSON body, field by field.
- **What happens on the server** — the real sequence of steps, including validations,
  side effects, and anything non-obvious.
- **Response** — the HTTP status and the exact shape of the body.
- **Errors** — the specific failures this endpoint can produce.

Field descriptions use these words consistently:

- **required** — the request is rejected with `400` if the field is missing.
- **optional** — may be omitted.
- **nullable** — may be sent as `null`.
- **digits only** — the value must be a string containing digits only (`"12345"`),
  not a number. This is enforced by a validation format called `digits`.

A note on types: IDs that live in the database as `BIGINT` are returned as **strings**
in JSON, and must be **sent as strings** too. Sending `12` instead of `"12"` fails validation.

---

## 2. Things that are true for every endpoint

### Base URL

All routes live under:

```
<server>/<MOUNT_PATH>/southOperation/...
```

`MOUNT_PATH` comes from an environment variable and is usually empty, which makes the
effective prefix simply `/southOperation`. The sub-routers are mounted like this:

| Sub-router | Prefix |
| --- | --- |
| Category | `/southOperation/categories` |
| SubCategory | `/southOperation/subCategories` |
| Location | `/southOperation/locations` |
| Group | `/southOperation/groups` |
| Room | `/southOperation/rooms` |
| UserGroup | `/southOperation/userGroup` |
| MappingReport | `/southOperation/mappingReport` |
| ItemType | `/southOperation/itemTypes` |
| GroupCodes | `/southOperation/groupCodes` |

### Authentication

Every route in this area sits behind the app's normal authentication layer. By the time a
controller runs, the server has already attached the signed-in user to the request, and the
controllers read two things off it:

- `req.appUser.identityNum` — the user's identity number, written into audit fields such as
  `createdBy`, `reportedBy` and `assignedBy`.
- `req.appUser.roles` — used for permission checks.

B2B (machine-to-machine) callers are rejected outright with `403` on any route that has a
role check.

### Role checks and role inheritance

Routes declare a list of allowed roles. A user passes if **any** of their roles grants **any**
of the required roles. Roles are not flat — some roles expand into others. In particular,
`DEVELOPER` and `SUPPORT` expand into essentially every South Operation role, so a developer
or support user passes every check in this document without being explicitly listed.

If the check fails the response is:

```
403 Forbidden   { "status": 403, "message": "user not authorized", ... }
```

> **Note:** the `UserGroup` routes have **no** role check at all. Any authenticated user can
> call them; the controller still limits *which groups* they can see or touch.

### Input validation

Most routes validate the incoming request against a JSON schema before the controller runs.
When validation fails you get a generic:

```
400 Bad Request   { "status": 400, "message": "bad request", ... }
```

The message is always the literal string `"bad request"` — it does **not** tell you which field
was wrong. The detailed reason is printed to the server console only.

Many schemas use `additionalProperties: false`, meaning **sending an unknown field is an error**,
not something that gets silently ignored. Each endpoint below says when this applies.

### The standard error body

Every error, from any endpoint, comes back in this shape:

```json
{
  "status": 400,
  "message": "human readable message",
  "data": null,
  "type": "generic-error"
}
```

Many business-rule messages are written in Hebrew. They are reproduced verbatim below, with an
English translation next to them.

### Soft deletes

Almost nothing is ever really deleted. Every table has an `isAvailable` boolean, and "deleting"
means setting it to `false`. Every read endpoint filters to `isAvailable = true`. This matters
in two ways:

1. A deleted record still occupies its ID and its unique values.
2. Re-creating something with the same key often **reactivates** the old row instead of
   inserting a new one, so old related data can come back with it.

### Audit trail and export queue

Nearly every write operation also records a user-action entry and pushes an entry onto an export
queue, inside the same database transaction as the write itself. This is invisible in the
response, but it means a write is all-or-nothing: if the audit write fails, the business write is
rolled back too.

### Transactions

Write endpoints wrap their work in a database transaction. A few of them send the HTTP response
from *inside* the transaction callback — see [Appendix B](#appendix-b--known-quirks-and-gotchas)
for why that occasionally matters.

---

## 3. The data model, in words

All nine tables live in the database schema `moving_south_operation`. None of them have
automatic `createdAt`/`updatedAt` columns; where timestamps exist they are explicit fields.

The domain is an equipment-mapping operation:

- The world is divided into **Groups**. A group is a unit or site, identified by a numeric ID.
- Each group contains **Rooms**. Each room sits at a **Location** and has a mapping status
  (waiting → in progress → done).
- Equipment is classified in a two-level tree: **Category** → **SubCategory**. A category can
  optionally be tagged with an **ItemType** (a coarse equipment type).
- Field users walk through rooms and file **MappingReports** — "in this room there are 4 of this
  sub-category, serial X, expiring on Y".
- **UserGroup** is the access table: it says which users may work on which groups.
- **GroupCodes** is a pre-registration table: before a group exists, an admin can register the
  group's code together with the identity numbers of the people who should automatically get
  access once someone creates that group.

Visually:

```
ItemType
   └── Category
          └── SubCategory ─────┐
                               │
GroupCodes ···(seeds)···> Group │
                          ├── UserGroup (user ↔ group access)
                          └── Room ──> MappingReport
                                │
                          Location
```

### Field reference per table

#### `item_types` (ItemType)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key, returned as a string |
| `description` | `description` | text | The type name |

There is no `isAvailable` column here — item types are never soft-deleted.

#### `categories` (Category)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key, string in JSON |
| `description` | `description` | text | Category name |
| `itemTypeId` | `item_type_id` | BIGINT, nullable | Optional link to an ItemType |
| `isSpecial` | `is_special` | boolean | Marks the category as "special" |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

Relations: belongs to one `ItemType`; has many `SubCategory`.

#### `sub_categories` (SubCategory)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key |
| `categoryId` | `category_id` | BIGINT | Parent category |
| `description` | `description` | text | Sub-category name |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

#### `locations` (Location)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key |
| `description` | `description` | text | Location name |
| `isAvailable` | `is_available` | boolean, default `true` | Soft-delete flag |

Relations: has many `Room`.

#### `group_codes` (GroupCodes)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key |
| `code` | `code` | string, max 4 | The group code |
| `identityNum` | `identity_num` | string, max 10, nullable | One person per row |
| `isAvailable` | `is_available` | boolean, default `true` | Soft-delete flag |

This table stores **one row per (code, person)** pair. A code with three people is three rows.
A code with no people is stored as a single row with `identityNum = ''` (empty string) acting as
a placeholder so the code still exists. The API hides all of this and presents a grouped view.

#### `groups` (Group)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | string | Primary key. **Not** auto-increment — generated by the server |
| `contactName` | `contact_name` | text | Point-of-contact name |
| `contactPhone` | `contact_phone` | string, max 10, nullable | Point-of-contact phone |
| `createdOn` | `created_on` | text | ISO timestamp, set by the server |
| `createdBy` | `created_by` | string, max 10 | Identity number of the creator |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

Relations: has many `Room`; has many `UserGroup`; many-to-many with `User` through `UserGroup`.

#### `user_group` (UserGroup)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `identityNum` | `identity_num` | BIGINT | **Composite primary key, part 1** |
| `groupId` | `group_id` | BIGINT | **Composite primary key, part 2** |
| `assignedOn` | `assigned_on` | timestamp | When access was granted |
| `assignedBy` | `assigned_by` | text | Who granted it |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

Because the primary key is the pair, a given person can only ever have one row per group —
removing and re-adding them reuses the same row.

#### `rooms` (Room)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key |
| `groupId` | `group_id` | string | Owning group |
| `description` | `description` | text | Room name / description |
| `status` | `status` | text | Free-text status. Meaningful values: `waiting`, `inProgress` |
| `locationId` | `location_id` | BIGINT | Where the room is |
| `roomManager` | `room_manager` | text, nullable | Person responsible |
| `startMappingTime` | `start_mapping_time` | timestamp, nullable | Set automatically when mapping begins |
| `endMappingTime` | `end_mapping_time` | timestamp, nullable | Set by the client when mapping ends |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

`status` is **not** constrained to an enum at any layer — any string is accepted. Only the exact
value `waiting` has special meaning: the server flips it to `inProgress` when the first mapping
report arrives.

#### `mapping_reports` (MappingReport)
| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `id` | `id` | BIGINT, auto-increment | Primary key |
| `roomId` | `room_id` | BIGINT | Which room this was found in |
| `reportedBy` | `reported_by` | text | Identity number, set by the server |
| `reportedOn` | `reported_on` | timestamp | Set by the server at creation |
| `subCategoryId` | `sub_category_id` | BIGINT | What kind of item |
| `status` | `status` | text | Free-text condition/status |
| `description` | `description` | text | Free-text notes |
| `quantity` | `quantity` | decimal | How many |
| `serial` | `serial` | text, nullable | Serial number |
| `itemPurpose` | `item_purpose` | text | What the item is for |
| `itemTarget` | `item_target` | text | Where the item is headed |
| `expirationDate` | `expiration_date` | timestamp, nullable | Expiry |
| `isAvailable` | `is_available` | boolean | Soft-delete flag |

---

## 4. ItemType — equipment types

Read-only reference data. There is exactly one endpoint; item types are created directly in the
database or by a seeder, never through the API.

### `GET /southOperation/itemTypes`

**What it does.** Returns the full list of equipment types, used to populate dropdowns when
creating or editing a category.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** None. No URL parameters, no query string, no body. Anything you send is ignored.

**What happens on the server.** A single unfiltered `SELECT` over the `item_types` table.
There is no `isAvailable` filter (the table has no such column) and no explicit ordering, so the
row order is whatever the database returns.

**Response.** `200 OK` with an array:

```json
[
  { "id": "1", "description": "ציוד מחשוב" },
  { "id": "2", "description": "ריהוט" }
]
```

An empty table produces `[]`, not an error.

**Errors.** `403` if the caller lacks the role. Nothing else.

---

## 5. Category — equipment categories

A category is the top level of the equipment tree. The interesting part of this resource is that
**sub-categories are managed through the category endpoints**, by sending the full desired list of
sub-category names on every write. The server diffs that list against what already exists.

### `GET /southOperation/categories`

**What it does.** Returns all live categories, each with its live sub-categories and its item type
already attached — one call is enough to render the whole equipment tree.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** None.

**What happens on the server.** Selects categories where `isAvailable = true`, joins in
sub-categories where `isAvailable = true`, joins in the item type, and orders by `id` descending
(newest category first).

> **Important:** the sub-category join is a strict inner join. **A category that currently has no
> available sub-categories will not appear in this list at all**, even though the category row
> itself is perfectly alive. If a category "disappears" from the UI after its last sub-category was
> removed, this is why.

**Response.** `200 OK` with an array of categories. Each element:

```json
{
  "id": "12",
  "description": "מחשבים ניידים",
  "itemTypeId": "1",
  "isSpecial": false,
  "isAvailable": true,
  "subCategories": [
    { "id": "31", "categoryId": "12", "description": "מחשב נייד 14 אינץ'", "isAvailable": true }
  ],
  "itemType": { "id": "1", "description": "ציוד מחשוב" }
}
```

`itemType` is `null` when the category has no `itemTypeId`.

**Errors.** `403` only.

---

### `POST /southOperation/categories`

**What it does.** Creates a new category together with its initial set of sub-categories, in one
atomic operation.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `description` | **required** | string, max 255 chars | The category name |
| `itemTypeId` | optional, nullable | string, digits only | Links the category to an item type |
| `isSpecial` | optional | boolean | Marks the category as special |
| `subCategories` | optional | array of strings | The **names** of the sub-categories to create — not IDs |
| `isAvailable` | optional | — | Accepted by the schema but **ignored**; new categories are always created available |

Example:

```json
{
  "description": "מחשבים ניידים",
  "itemTypeId": "1",
  "isSpecial": false,
  "subCategories": ["מחשב נייד 14 אינץ'", "מחשב נייד 16 אינץ'"]
}
```

**What happens on the server.** Inside one transaction:

1. The category row is created with `isAvailable = true`.
2. Each name in `subCategories` becomes a new sub-category row pointing at the new category.
3. An audit entry and an export-queue entry are written.
4. The category is re-read with its sub-categories and item type joined in, and returned.

Because the category is brand new, the diffing logic in step 2 has nothing to compare against, so
every name in the list is simply inserted. Duplicate names inside the array are inserted as
separate rows — there is no de-duplication.

**Response.** `200 OK` (not `201`) with the newly created category, in exactly the same shape as one
element of the `GET` response.

> If you omit `subCategories` or send an empty array, the category is created successfully but
> the object returned is `null`, because the re-read uses the same inner join described above.
> The category does exist; it just will not appear in `GET` until it has at least one
> sub-category.

**Errors.**
- `400 "bad request"` — `description` missing, wrong types, or an unrecognised field.
- `403` — role check.
- `500` — database failure; the whole transaction rolls back, so no partial category is left behind.

---

### `PATCH /southOperation/categories`

**What it does.** Updates a category **and reconciles its sub-category list**. Note the ID travels
in the body, not the URL.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | Which category to update |
| `description` | **required** | string, max 255 | New name — you must resend it even if unchanged |
| `itemTypeId` | optional, nullable | string, digits only | New item type; sending `null`/omitting clears it |
| `isSpecial` | optional | boolean | New value; omitting sets it to `undefined` |
| `subCategories` | optional | array of strings | The **complete desired list** of sub-category names |
| `isAvailable` | optional | — | Accepted by the schema but never applied |

**What happens on the server.** This is the most involved endpoint in the module.

1. The category is loaded by `id` with `isAvailable = true`. Missing → `400`.
2. `description`, `itemTypeId` and `isSpecial` are overwritten with whatever the body contained.
   This is a **replace, not a merge** — omitting `itemTypeId` or `isSpecial` blanks them out.
3. The sub-category reconciliation runs, comparing the submitted names against the currently
   available sub-categories of this category:
   - Names in your list that do not exist yet → **created**.
   - Existing sub-categories whose names are **not** in your list → candidates for removal.
4. Before removing anything, the server checks whether any **live mapping report** references any
   of those candidate sub-categories. If even one does, the whole request fails with:
   `קיימים מיפויים המשויכים לתת הקטגוריות שאתה מנסה למחוק: <names>`
   ("There are mappings associated with the sub-categories you are trying to delete: …").
   Nothing is changed — the transaction rolls back.
5. Otherwise the removal candidates are soft-deleted (`isAvailable = false`) and the new names
   are inserted.
6. An audit entry and export-queue entry are written, the category is re-read with its joins, and
   returned.

> **Watch out:** matching is done on the **description text**, not on IDs. Renaming a
> sub-category is therefore impossible as an edit — the old name disappears from your list and
> the new one appears, so the server soft-deletes the old row and inserts a brand-new one with a
> new ID. If any mapping report pointed at the old row, step 4 blocks the whole request.

> **Also watch out:** omitting `subCategories` entirely sends `undefined` into the reconciliation
> step, which throws and surfaces as a `500`. Always send the array, even if it is unchanged.

**Response.** `200 OK` with the updated category, joined the same way as `GET`.

**Errors.**
- `400 "bad request"` — schema failure (missing `id` or `description`, unknown field).
- `400 לא קיימת קטגוריה <id>` — "category `<id>` does not exist" (or it is soft-deleted).
- `400 קיימים מיפויים המשויכים לתת הקטגוריות...` — a sub-category you tried to remove is in use.
- `403` — role check.

---

### `DELETE /southOperation/categories/:id`

**What it does.** Soft-deletes a category together with all of its sub-categories — but only if
nothing is using them.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** One URL parameter.

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | The category to delete |

**What happens on the server.**

1. All available sub-categories of the category are loaded, and the category itself.
2. If **any** live mapping report points at **any** of those sub-categories, the request fails with
   `קיימים מיפויים המשויכים לקטגוריה הזו` ("There are mappings associated with this category").
   Nothing is changed.
3. If the category does not exist or is already deleted → `404 "Category not found"`.
   (Note the different status and the English message — this is the one place in the module that
   uses `404`.)
4. Otherwise, inside a transaction, the category and every one of its sub-categories get
   `isAvailable = false`, plus the audit and export entries.

Nothing is physically removed, and the IDs are never reused.

**Response.** `200 OK`:

```json
{ "success": true, "id": "12" }
```

**Errors.**
- `400 "bad request"` — `id` is not digits-only.
- `400 קיימים מיפויים המשויכים לקטגוריה הזו` — the category is in use.
- `404 "Category not found"` — unknown or already-deleted category.
- `403` — role check.

---

## 6. SubCategory — equipment sub-categories

Direct endpoints for sub-categories exist, but in normal use sub-categories are managed through
the Category endpoints described above. These routes allow a wider set of roles than the rest of
the module.

### `GET /southOperation/subCategories`

**What it does.** Returns every sub-category in the system, flat, with no parent object attached.

**Who can call it.** `MARHAS`, `COMMANDER`, `OPERATION_ENDUSER`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.
Note that `SOUTH_ADMIN` is **not** on this list.

**Input.** Optional query string.

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `operId` | optional, nullable | string, digits only | **Accepted but completely ignored** — see below |

Unknown query parameters are rejected.

**What happens on the server.** The controller loads all categories with an empty filter, collects
their IDs, then returns all sub-categories whose `categoryId` is in that list.

> Two things about this that are worth knowing:
> - `operId` is validated but never read. Passing it changes nothing.
> - **There is no `isAvailable` filter anywhere in this endpoint.** Unlike every other read in the
>   module, this returns soft-deleted sub-categories belonging to soft-deleted categories as well.
>   If you need only live ones, filter on `isAvailable` yourself, or read them from
>   `GET /categories` instead, which does filter correctly.

**Response.** `200 OK` with a flat array:

```json
[
  { "id": "31", "categoryId": "12", "description": "מחשב נייד 14 אינץ'", "isAvailable": true },
  { "id": "32", "categoryId": "12", "description": "ישן", "isAvailable": false }
]
```

**Errors.** `400 "bad request"` for an unknown query parameter or a non-digit `operId`; `403` for role.

---

### `POST /southOperation/subCategories`

**What it does.** Creates a single sub-category under an existing category.

**Who can call it.** `MARHAS`, `COMMANDER`, `OPERATION_ENDUSER`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `categoryId` | **required** | string, digits only | The parent category |
| `description` | **required** | string, max 255 | The sub-category name |
| `isAvailable` | optional | — | Accepted by the schema but not meaningfully used |

**What happens on the server.**

1. The parent category is checked: it must exist **and** be available. If not, the request fails
   with `לא קיימת קטגוריה <id>` ("category `<id>` does not exist").
2. Inside a transaction the sub-category is created from the body as-is, followed by the audit and
   export entries.

There is **no duplicate check** — creating the same name under the same category twice produces two
rows.

**Response.** `200 OK` with the created sub-category:

```json
{ "id": "45", "categoryId": "12", "description": "מחשב נייד 16 אינץ'", "isAvailable": true }
```

**Errors.**
- `400 "bad request"` — missing `categoryId`/`description` or an unknown field.
- `400 לא קיימת קטגוריה <id>` — the parent category does not exist or is soft-deleted.
- `403` — role check.

---

### `PATCH /southOperation/subCategories`

**What it does.** Renames a sub-category and/or moves it to a different category. The ID travels in
the body.

**Who can call it.** `MARHAS`, `COMMANDER`, `OPERATION_ENDUSER`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | Which sub-category to update |
| `categoryId` | optional, nullable | string, digits only | Move to a different parent category |
| `description` | optional, nullable | string, max 255 | New name |
| `isAvailable` | optional | — | Accepted by the schema but **never applied** — you cannot delete or restore a sub-category through this endpoint |

**What happens on the server.**

1. The sub-category is loaded by `id`. Note this lookup does **not** filter on `isAvailable`, so a
   soft-deleted sub-category can still be edited. Missing → `400 לא קיימת תת קטוגריה <id>`.
2. If `categoryId` was supplied, the target category is validated (must exist and be available).
3. `description` and `categoryId` are applied **only if truthy**. Sending `null` or an empty string
   leaves the existing value untouched rather than clearing it.
4. The row is saved inside a transaction, along with audit and export entries.

**Response.** `200 OK` with the full updated sub-category row.

**Errors.**
- `400 "bad request"` — missing `id` or an unknown field.
- `400 לא קיימת תת קטוגריה <id>` — "sub-category `<id>` does not exist".
- `400 לא קיימת קטגוריה <id>` — the target category does not exist.
- `403` — role check.

---

## 7. Location — physical locations

Simple reference data describing where a room physically is. Reading is open to the usual three
South roles; **all writes are restricted to `SOUTH_ADMIN` alone**.

### `GET /southOperation/locations`

**What it does.** Returns all live locations, newest first, for populating a location dropdown.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** None.

**What happens on the server.** Selects locations where `isAvailable = true`, ordered by `id`
descending. Rooms are **not** joined in.

**Response.** `200 OK`:

```json
[
  { "id": "7", "description": "מחסן ראשי", "isAvailable": true },
  { "id": "3", "description": "משרד קומה 2", "isAvailable": true }
]
```

**Errors.** `403` only.

---

### `POST /southOperation/locations`

**What it does.** Creates a new location.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `description` | **required** | string, max 255 | The location name |

**What happens on the server.** The description is re-checked for emptiness (an empty string
passes the schema but fails here with `חסרים נתונים`, "missing data"). Then, inside a transaction,
the location is created with `isAvailable = true`, and audit and export entries are written.

There is **no uniqueness check** — the same description can be created many times.

**Response.** `201 Created` — one of only two endpoints in the module that use `201`:

```json
{ "id": "8", "description": "מחסן משני", "isAvailable": true }
```

**Errors.**
- `400 "bad request"` — `description` missing, too long, or unknown field present.
- `400 חסרים נתונים` — `description` was present but empty.
- `403` — caller is not `SOUTH_ADMIN`.

---

### `PATCH /southOperation/locations/:id`

**What it does.** Renames a location. Only the description can be changed.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.**

| Where | Field | Required? | Type | Meaning |
| --- | --- | --- | --- | --- |
| URL | `id` | **required** | string, max 20 chars | Which location |
| Body | `description` | **required** | string, max 255 | The new name |

Unknown body fields are rejected. Note the URL `id` is validated only by length, not as digits.

**What happens on the server.** The location must exist — but the existence check does **not**
filter on `isAvailable`, so a soft-deleted location can still be renamed. Then, inside a
transaction, the description is updated, audit and export entries are written, and the fresh row is
read back.

There is no way to change `isAvailable` through this endpoint.

**Response.** `200 OK` with the updated location row.

**Errors.**
- `400 "bad request"` — missing `description`, or unknown body field.
- `400 לא קיים מיקום <id>` — "location `<id>` does not exist".
- `403` — caller is not `SOUTH_ADMIN`.

---

### `DELETE /southOperation/locations/:id`

**What it does.** Soft-deletes a location, but refuses if any live room still sits there.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, max 20 chars | The location to delete |

**What happens on the server.**

1. The location must exist (again, without an `isAvailable` filter).
2. All rooms with `locationId = id` and `isAvailable = true` are loaded. If there is at least one,
   the request fails with `קיימים חדרים עם המיקום` ("there are rooms with this location") and
   nothing changes.
3. Otherwise `isAvailable` is set to `false`.

> Unlike most writes in this module, this one runs **without a transaction** and **writes no audit
> or export entry**. The delete will not appear in the audit trail.

**Response.** `200 OK` with just the ID — no `success` flag, unlike the other delete endpoints:

```json
{ "id": "8" }
```

**Errors.**
- `400 לא קיים מיקום <id>` — unknown location.
- `400 קיימים חדרים עם המיקום` — the location is still in use by at least one live room.
- `403` — caller is not `SOUTH_ADMIN`.

---

## 8. GroupCodes — group code allocations

This resource pre-registers a 4-character group code along with the identity numbers of people who
should automatically receive access to any group later created under that code. It is the
bootstrapping mechanism for permissions: without it, a newly created group would only be accessible
to whoever created it.

**The storage model versus the API model.** The table stores one row per (code, person) pair, but
every endpoint here presents a **grouped** view: one object per code, with an array of identity
numbers. A code with no people is stored internally as a single row with an empty-string
`identityNum`, purely so that the code continues to exist; that placeholder row is filtered out of
the response.

Note the JSON field name for the array is `identity_nums` — snake_case, unlike everything else in
this module.

### `GET /southOperation/groupCodes`

**What it does.** Returns every live group code with the list of people attached to it.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_MANAGMENT`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`. This is the
only read in the module that includes `SOUTH_MANAGMENT`.

**Input.** None.

**What happens on the server.** Selects all rows with `isAvailable = true`, ordered by `code`
ascending, then folds them into one object per code. The `id` in the output is the ID of the
**first row encountered** for that code — it is not a stable identifier for the code as a whole and
should not be used to address it. Use `code` for that. Rows whose `identityNum` is empty contribute
nothing to the array.

**Response.** `200 OK`:

```json
[
  { "id": "14", "code": "1234", "identity_nums": ["1111111", "2222222"] },
  { "id": "19", "code": "5678", "identity_nums": [] }
]
```

The second entry is a code that exists but currently has nobody attached.

**Errors.** `403` only.

---

### `POST /southOperation/groupCodes`

**What it does.** Registers a new group code with an initial list of people.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `code` | **required** | string, max 4 chars | The group code |
| `identityNums` | **required** | array of strings, each max 10 chars | Identity numbers to attach. May be empty (`[]`) |

Note the asymmetry: you **send** `identityNums`, but you **receive** `identity_nums`.

**What happens on the server.** Inside one transaction:

1. Empty `code` → `400 חסרים נתונים` ("missing data").
2. All existing rows for this code are loaded, including soft-deleted ones. If **any** of them is
   still available, the request fails with `כבר קיים קוד <code>` ("code `<code>` already exists").
   You must delete the code before re-creating it.
3. Every row for the code is set to `isAvailable = false`, wiping the slate.
4. Each identity number you sent is then either **reactivated** (if a soft-deleted row already
   exists for that person and code) or **inserted** as a new row.
5. If you sent an empty array, the empty-string placeholder row is reactivated or created so the
   code still exists with nobody attached.
6. Audit and export entries are written.

**Response.** `201 Created` — but see the warning below.

> **Known defect:** the helper that builds the response body has a missing `return` statement on its
> main path. It returns a value only when the code has **no** rows at all, in which case it returns
> `{}`. In every successful case it returns `undefined`, so **the response body is empty**. The
> write itself succeeds and is committed normally. Clients must not rely on the response body —
> call `GET /southOperation/groupCodes` afterwards to read back the result. The same defect affects
> `PATCH` and `DELETE` on this resource.

**Errors.**
- `400 "bad request"` — missing `code`/`identityNums`, a value too long, or an unknown field.
- `400 חסרים נתונים` — empty `code`.
- `400 כבר קיים קוד <code>` — the code is already active.
- `403` — caller is not `SOUTH_ADMIN`.

---

### `PATCH /southOperation/groupCodes/:code`

**What it does.** Replaces the list of people attached to an existing code. This is a full
replacement, not an append — whoever is missing from your list is removed.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.**

| Where | Field | Required? | Type | Meaning |
| --- | --- | --- | --- | --- |
| URL | `code` | **required** | string, max 4 | The code to edit |
| Body | `identityNums` | **required** | array of strings, each max 10 | The complete desired list of people |

Unknown body fields are rejected.

**What happens on the server.**

1. The code must exist and be available, otherwise `לא קיים קוד קבוצה <code>`
   ("group code `<code>` does not exist").
2. Inside a transaction the server compares your list against the current rows:
   - In your list and not currently active → **added** (reactivated if a soft-deleted row exists,
     otherwise inserted).
   - Currently active but not in your list → **soft-deleted**.
   - In both → left alone.
3. Audit and export entries are written.

Sending `[]` removes everyone from the code but leaves the code itself active.

> **Note:** this endpoint does not manage the empty-string placeholder row the way `POST` does. A
> code emptied via `PATCH` still exists and still appears in `GET` with an empty `identity_nums`
> array, because at least one of its rows (the placeholder from creation) remains active.

**Response.** `200 OK`, **with an empty body** — same defect described under `POST`. Re-read via
`GET` to confirm.

**Errors.**
- `400 "bad request"` — missing `identityNums` or an unknown field.
- `400 לא קיים קוד קבוצה <code>` — unknown or already-deleted code.
- `403` — caller is not `SOUTH_ADMIN`.

---

### `DELETE /southOperation/groupCodes/:code`

**What it does.** Soft-deletes an entire group code and everyone attached to it — but refuses if any
live group was already created under that code.

**Who can call it.** `SOUTH_ADMIN` only.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `code` | **required** | string, max 4 | The code to delete |

**What happens on the server.**

1. The code must exist and be available.
2. The server looks for any live group whose ID **starts with** this code. A leading zero on the
   code is stripped first, because group IDs are numeric and drop leading zeros — so code `0123`
   is matched against group IDs starting `123`. If any match is found, the request fails with
   `קיימות קבוצות עם הקוד <code>` ("there are groups with code `<code>`").
3. Otherwise every row for the code — including the placeholder — is set to `isAvailable = false`,
   and audit and export entries are written inside a transaction.

> **Caution:** the prefix match is on string prefix, not on exact code boundaries. Deleting code
> `12` will be blocked by a group with ID `1234001`, which actually belongs to code `1234`.

**Response.** `200 OK`, **with an empty body** — same defect described under `POST`.

**Errors.**
- `400 לא קיים קוד קבוצה <code>` — unknown or already-deleted code.
- `400 קיימות קבוצות עם הקוד <code>` — groups already exist under this code.
- `403` — caller is not `SOUTH_ADMIN`.

---

## 9. Group — groups (units/stations)

A group is the main organisational unit. Almost everything else in the module is scoped by group,
and **most read endpoints silently filter their results by which groups the caller may see**.

### How group visibility works

This logic is shared by Group, Room, UserGroup and MappingReport, and it is the single most
important thing to understand about this module.

- If the user holds any of `DEVELOPER`, `SUPPORT`, `SOUTH_ADMIN` or `SOUTH_MANAGMENT`, they are
  **"all allowed"**: every group is visible and every group-scoped check passes automatically.
- Otherwise, if the user holds `SOUTH_COMMAND` or `SOUTH_ENDUSER`, their allowed groups are read
  from the `user_group` table — the groups they have a live assignment to. Anything outside that
  list does not exist as far as they are concerned.
- A user with neither set of roles ends up with an empty allowed list and sees nothing.

When a restricted user asks for a group they are not assigned to, the server does **not** return
`403`. It returns `400` with a "does not exist" message, deliberately not revealing whether the
group is real.

---

### `GET /southOperation/groups`

**What it does.** Returns the groups the caller may see, each with its rooms and user assignments
attached.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** None.

**What happens on the server.** The allowed-groups rules above are applied. The query then selects
groups with `isAvailable = true` (restricted to the allowed IDs where applicable), joining in the
group's `userGroups` and its `rooms` where the rooms are available. Both joins are optional, so a
group with no rooms and no users still appears. Results are ordered by `created_on` descending —
newest group first.

> The `userGroups` join is **not** filtered by `isAvailable`, so it includes revoked assignments.
> Filter client-side if you only want current members.

**Response.** `200 OK`:

```json
[
  {
    "id": "1234001",
    "contactName": "ישראל ישראלי",
    "contactPhone": "0501234567",
    "createdOn": "2026-09-01T10:00:00.000Z",
    "createdBy": "1111111",
    "isAvailable": true,
    "userGroups": [
      { "identityNum": "1111111", "groupId": "1234001", "assignedOn": "...", "assignedBy": "1111111", "isAvailable": true }
    ],
    "rooms": [
      { "id": "55", "groupId": "1234001", "description": "חדר שרתים", "status": "waiting", "locationId": "7", "roomManager": null, "startMappingTime": null, "endMappingTime": null, "isAvailable": true }
    ]
  }
]
```

**Errors.** `403` only. A user with no accessible groups gets `200 []`.

---

### `GET /southOperation/groups/:groupId`

**What it does.** Returns a single group, without rooms or users attached.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `groupId` | **required** | string, digits only | The group to fetch |

Extra URL parameters are rejected.

**What happens on the server.** The caller's allowed-groups list is computed. If they are restricted
and the requested group is not in their list, the request fails immediately with a "does not exist"
error. Otherwise the group is loaded with `isAvailable = true`; a missing or deleted group produces
the same error.

**Response.** `200 OK` with the bare group object — the same fields as above, but **no** `rooms` and
**no** `userGroups`.

**Errors.**
- `400 "bad request"` — `groupId` is not digits-only.
- `400 לא קיימת תחנה <groupId>` — "station `<groupId>` does not exist". Returned both when the group
  genuinely does not exist and when the caller simply has no access to it.
- `403` — role check.

---

### `POST /southOperation/groups`

**What it does.** Creates a new group. This endpoint behaves unusually in two ways: **the `id` you
send is a prefix, not the final ID**, and the server automatically grants access to a set of users
derived from the matching group code.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | The **group code** to create this group under — used as a prefix, not as the literal ID |
| `contactName` | optional | string, max 255 | Point of contact |
| `contactPhone` | optional, nullable | string, max 10 | Contact phone |
| `createdOn` | optional | string, max 255 | **Ignored** — the server always uses the current time |
| `createdBy` | optional | string, max 10 | **Ignored** — the server always uses the caller's identity number |

**What happens on the server.**

1. **ID generation.** A leading zero is stripped from the submitted `id` to form a search prefix.
   The server then finds the highest existing group ID starting with that prefix (including
   soft-deleted ones):
   - If one exists, the new ID is that value **plus one**.
   - If none exists, the new ID is `Number(id) * 1000 + 1`.

   So the first group created under code `1234` gets ID `1234001`, the next `1234002`, and so on.
   Because the search includes soft-deleted groups, IDs are never reused after a delete.
2. **Pre-registered users.** All distinct identity numbers registered in `group_codes` for this
   code are collected. Note this lookup uses the code **exactly as submitted**, including any
   leading zero — so it can disagree with the prefix search in step 1 if the caller is inconsistent
   about leading zeros.
3. Inside a transaction: the group row is created; audit and export entries are written; and a
   `user_group` row is created for each pre-registered identity number **plus the caller**,
   de-duplicated, each marked available and stamped with the caller as the assigner.

The creator always ends up with access to the group they just created, even if they were not in the
group code.

**Response.** `200 OK` with the created group plus the assignments that were made:

```json
{
  "id": "1234001",
  "contactName": "ישראל ישראלי",
  "contactPhone": "0501234567",
  "createdOn": "2026-09-15T08:30:00.000Z",
  "createdBy": "1111111",
  "userGroups": [
    { "identityNum": "1111111", "groupId": "1234001", "isAvailable": true, "assignedOn": "...", "assignedBy": "1111111" }
  ]
}
```

`isAvailable` is not part of this particular response, because the object is assembled from the
values that were written rather than re-read from the database.

**Errors.**
- `400 "bad request"` — `id` missing or not digits-only, or an unknown field present.
- `403` — role check.
- `500` — database failure; the transaction rolls back and no group or assignment is created.

> There is **no check that the group code exists**. Creating a group under an unregistered code
> succeeds; it just means nobody but the creator gets access.

---

### `PATCH /southOperation/groups`

**What it does.** Updates a group's contact details, and — for privileged roles only — its
availability flag. The ID travels in the body.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | Which group |
| `contactName` | optional, nullable | string, max 255 | New contact name |
| `contactPhone` | optional, nullable | string, max 10 | New contact phone |
| `isAvailable` | optional, nullable | boolean | **Protected field** — see below |
| `createdOn` | optional, nullable | string, max 255 | Accepted by the schema but never applied |
| `createdBy` | optional, nullable | string, max 10 | Accepted by the schema but never applied |

**What happens on the server.**

1. **Protected-field check.** If the body contains `isAvailable` and the caller does *not* hold one
   of `DEVELOPER`, `SUPPORT`, `SOUTH_ADMIN`, `SOUTH_MANAGMENT` or `SOUTH_COMMAND`, the request is
   rejected with `403 אין למשתמש הרשאות לערוך שדות אלו` ("the user lacks permission to edit these
   fields"). In practice this blocks a plain `SOUTH_ENDUSER` from flipping availability, while
   still letting them edit contact details.
2. The group is loaded by ID. Note this lookup does **not** filter on `isAvailable`, so a
   soft-deleted group can be edited — and restored, by sending `isAvailable: true`.
3. Only fields actually **present in the body** are applied. This is a true partial update: omitting
   `contactPhone` leaves it as it was, whereas sending `"contactPhone": null` clears it.
4. The row is saved inside a transaction alongside audit and export entries.

> **Note:** unlike the group read endpoints, this one does **not** check whether the caller is
> assigned to the group. Any user with an accepted role may edit any group by ID.

**Response.** `200 OK` with the updated group. Because the group was loaded with its rooms joined
in, the response also carries a `rooms` array of the group's available rooms.

**Errors.**
- `400 "bad request"` — missing `id` or an unknown field.
- `400 לא קיימת קבוצה <id>` — "group `<id>` does not exist".
- `403 אין למשתמש הרשאות לערוך שדות אלו` — attempted to change `isAvailable` without the rank for it.
- `403` — role check on the route itself.

---

### `PATCH /southOperation/groups/delete/`

**What it does.** Soft-deletes a group and cascades to its rooms and user assignments. Note this is
a `PATCH`, not a `DELETE`, and the target ID goes in the body.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body — the same schema as `PATCH /groups`, but only `id` is actually used.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | The group to delete |

Other fields in the body are validated but ignored.

**What happens on the server.**

1. All available rooms of the group are loaded. If any live mapping report points at any of them,
   the request fails with `קיימים מיפויים המקושרים לקבוצה` ("there are mappings linked to the
   group") and nothing changes.
2. The group must exist, otherwise `לא קיימת תחנה <id>` ("station `<id>` does not exist"). This
   lookup does not filter on `isAvailable`, so re-deleting an already-deleted group succeeds.
3. Inside a transaction the cascade runs: the group, then every one of its available rooms, then
   every one of its available user assignments, are all set to `isAvailable = false`. Audit and
   export entries are written.

> **Note:** like `PATCH /groups`, this does **not** verify the caller is assigned to the group.

**Response.** `200 OK`:

```json
{ "success": true, "id": "1234001" }
```

**Errors.**
- `400 "bad request"` — missing `id`.
- `400 קיימים מיפויים המקושרים לקבוצה` — mapping reports still exist under this group.
- `400 לא קיימת תחנה <id>` — unknown group.
- `403` — role check.

---

## 10. UserGroup — who is allowed into which group

This table drives the entire visibility system described above: it records which users may work on
which groups. It is the only resource in the module with **no role check on its routes** — any
authenticated user can call both endpoints. Access is still constrained, but only by the
allowed-groups logic inside the controllers.

### `GET /southOperation/userGroup`

**What it does.** Lists group assignments — either your own, or those of a specific group, or all
the ones you can see.

**Who can call it.** Any authenticated user.

**Input.** Query string. **At least one parameter is required** (the schema enforces a minimum of
one property), and unknown parameters are rejected.

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `self` | optional | the string `"true"` or `"false"` | When `"true"`, restrict results to the caller's own assignments |
| `groupId` | optional | string, digits only | Restrict results to one group |

Calling with no query string at all is a `400`.

**What happens on the server.**

1. If `groupId` was supplied and the caller is not allowed to see that group, the request fails with
   `לא קיימת הקבוצה <groupId>` ("group `<groupId>` does not exist").
2. A filter is built: `identityNum` = the caller when `self=true`; `groupId` when supplied; plus
   `isAvailable = true` always.
3. If no `groupId` was supplied and the caller is restricted, the filter is narrowed to their
   allowed group list. Privileged callers ("all allowed") get every assignment in the system.

So `?self=true` returns "which groups am I assigned to", and `?groupId=X` returns "who is assigned
to group X".

**Response.** `200 OK`:

```json
[
  {
    "identityNum": "1111111",
    "groupId": "1234001",
    "assignedOn": "2026-09-01T10:00:00.000Z",
    "assignedBy": "1111111",
    "isAvailable": true
  }
]
```

**Errors.**
- `400 "bad request"` — no parameters at all, an unknown parameter, `self` not exactly `"true"`/`"false"`, or a non-digit `groupId`.
- `400 לא קיימת הקבוצה <groupId>` — no access to that group, or it does not exist.

---

### `PATCH /southOperation/userGroup`

**What it does.** Sets the complete list of users assigned to a group. This is a full replacement:
anyone not in your list loses access.

**Who can call it.** Any authenticated user — but only for groups they can already see.

**Input.** JSON body. Unknown fields are rejected.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `users` | **required** | array of strings, each digits only | The complete desired list of identity numbers |
| `groupId` | *effectively required* | string, digits only | The group to update |

> The schema marks only `users` as required, but the controller cannot work without `groupId` —
> omitting it produces a `400 לא קיימת הקבוצה undefined`. Always send both.

**What happens on the server.**

1. The caller must be allowed to see `groupId`, otherwise `לא קיימת הקבוצה <groupId>`.
2. All assignment rows for the group are loaded, including revoked ones, and compared against your
   list:
   - Currently active but not in your list → **revoked** (`isAvailable = false`).
   - In your list with a revoked row → **reactivated**, with `assignedBy` and `assignedOn` refreshed
     to the caller and the current time.
   - In your list with no row at all → **created**.
   - Already active and in your list → untouched, so the original `assignedOn` is preserved.
3. All of this runs in one transaction, plus audit and export entries.
4. The live assignments for the group are then re-read and returned.

> **Be careful:** sending `"users": []` revokes everyone's access to the group, **including your
> own**. A restricted user who does this immediately loses visibility of the group and cannot undo
> it without help from a privileged user. There is no guard against this.

> The identity numbers are **not** validated against the user table — you can assign a
> non-existent person without error.

**Response.** `200 OK`. Normally an array of the live assignments:

```json
[
  { "identityNum": "1111111", "groupId": "1234001", "assignedOn": "...", "assignedBy": "1111111", "isAvailable": true }
]
```

If the result is empty (you revoked everyone), the response is **an object instead of an array**:

```json
{ "groupId": "1234001" }
```

Clients must handle both shapes.

**Errors.**
- `400 "bad request"` — missing `users`, a non-digit identity number, or an unknown field.
- `400 לא קיימת הקבוצה <groupId>` — no access to the group, or `groupId` was omitted.

---

## 11. Room — rooms inside a group

A room is a physical space inside a group that gets mapped. Its `status` field tracks the mapping
workflow, and the server advances it automatically when the first mapping report arrives.

All room endpoints enforce the group visibility rules: you can only see and modify rooms belonging
to groups you are assigned to.

### `GET /southOperation/rooms`

**What it does.** Lists rooms, either for one group or across all groups you can see, with each
room's location joined in.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** Query string.

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `groupId` | optional, nullable | string | Restrict to one group. Not required to be digits-only here |

**What happens on the server.**

- If `groupId` is supplied, the caller must be allowed to see it, otherwise
  `לא קיימת קבוצה <groupId>`. The filter is then set to that group.
- If it is omitted and the caller is restricted, the filter is set to all of their allowed groups.
- Privileged callers with no `groupId` get every room in the system.
- `isAvailable = true` is always applied. There is no explicit ordering.

**Response.** `200 OK`, each room with a nested `location`:

```json
[
  {
    "id": "55",
    "groupId": "1234001",
    "description": "חדר שרתים",
    "status": "inProgress",
    "locationId": "7",
    "roomManager": "1111111",
    "startMappingTime": "2026-09-15T09:00:00.000Z",
    "endMappingTime": null,
    "isAvailable": true,
    "location": { "id": "7", "description": "מחסן ראשי", "isAvailable": true }
  }
]
```

**Errors.**
- `400 לא קיימת קבוצה <groupId>` — no access to the requested group.
- `403` — role check.

---

### `GET /southOperation/rooms/:roomId`

**What it does.** Returns one room, without its location joined in.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `roomId` | **required** | string | The room to fetch |

**What happens on the server.** The room is loaded by ID — **without** an `isAvailable` filter, so
soft-deleted rooms are still readable through this endpoint — and the caller must be allowed to see
the room's owning group.

**Response.** `200 OK` with the bare room object. Unlike the list endpoint, there is **no** nested
`location` here; you only get `locationId`.

**Errors.**
- `400 לא קיים חדר <roomId>` — "room `<roomId>` does not exist", returned both for an unknown room
  and for one in a group the caller cannot see. (This particular error is constructed without an
  explicit status code, so it may surface as `500` rather than `400` — see
  [Appendix B](#appendix-b--known-quirks-and-gotchas).)
- `403` — role check.

---

### `POST /southOperation/rooms`

**What it does.** Creates a room inside a group.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are **allowed** by this schema but ignored by the controller.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `groupId` | **required** | string, digits only | Owning group |
| `status` | **required** | string | Initial status. Send `"waiting"` for the automatic workflow to work |
| `description` | optional, nullable | string, max 255 | Room name |
| `locationId` | optional | string | Which location the room sits at |
| `roomManager` | optional, nullable | string | Person responsible |
| `startMappingTime` | optional, nullable | string | Usually left out — set automatically |
| `endMappingTime` | optional, nullable | string | Usually left out |

**What happens on the server.**

1. The group must exist (`לא קיימת קבוצה <groupId>` if not) **and** the caller must be allowed to
   see it (same message if not).
2. Any field you omitted is dropped rather than written as `null`, and `isAvailable: true` is added.
3. Inside a transaction the room is created and audit and export entries are written.

> `locationId` is **not validated** — you can create a room pointing at a non-existent or
> soft-deleted location. `status` is likewise unconstrained.

**Response.** `200 OK` with the created room, without a nested `location`.

**Errors.**
- `400 "bad request"` — missing `groupId` or `status`, or `groupId` not digits-only.
- `400 לא קיימת קבוצה <groupId>` — the group does not exist or the caller cannot see it.
- `403` — role check.

---

### `PATCH /southOperation/rooms`

**What it does.** Updates a room. The ID travels in the body. A room cannot be moved between groups.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are allowed by the schema but ignored.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | Which room |
| `description` | optional, nullable | string, max 255 | New name |
| `status` | optional, nullable | string | New status — this is how the client marks a room finished |
| `locationId` | optional, nullable | string | New location |
| `roomManager` | optional, nullable | string | New responsible person |
| `startMappingTime` | optional, nullable | string | Override the mapping start time |
| `endMappingTime` | optional, nullable | string | Set when mapping is complete |
| `isAvailable` | optional, nullable | boolean | **Accepted but always overridden to `true`** — see below |

`groupId` is deliberately not updatable.

**What happens on the server.**

1. The room is loaded by ID (no `isAvailable` filter) and the caller must be allowed to see its
   group; otherwise `לא קיים חדר  <id>` (note the double space in the actual message).
2. The room's group is re-validated as still existing.
3. Every supplied field is copied onto the room. Omitted fields are left untouched.
4. The row is saved inside a transaction with audit and export entries.

> **Important:** `isAvailable: true` is hard-coded into the update payload regardless of what you
> send. Two consequences: you cannot soft-delete a room through `PATCH` (use the `DELETE` route),
> and **any `PATCH` to a previously deleted room silently restores it**.

**Response.** `200 OK` with the updated room.

**Errors.**
- `400 "bad request"` — missing `id` or `id` not digits-only.
- `400 לא קיים חדר  <id>` — unknown room, or a room in a group the caller cannot see.
- `400 לא קיימת קבוצה <groupId>` — the room's own group has vanished.
- `403` — role check.

---

### `DELETE /southOperation/rooms/delete/:roomId`

**What it does.** Soft-deletes a room, refusing if it still has mapping reports. Note the unusual
`/delete/` segment in the path.

**Who can call it.** `SOUTH_ADMIN`, `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `roomId` | **required** | string | The room to delete |

**What happens on the server.**

1. The room is loaded, and all live mapping reports for it are counted. If there are any, the
   request fails with `קיימים מיפויים המקושרים לחדר` ("there are mappings linked to the room").
   This check runs **before** the existence and permission checks.
2. The room must exist and be in a group the caller can see, otherwise `לא קיים חדר  <roomId>`.
3. The room's group is re-validated.
4. Inside a transaction `isAvailable` is set to `false`, with audit and export entries.

Deleting a room does **not** cascade to its mapping reports — but step 1 guarantees there are none
to cascade to.

**Response.** `200 OK`:

```json
{ "success": true, "id": "55" }
```

**Errors.**
- `400 קיימים מיפויים המקושרים לחדר` — the room still has live mapping reports.
- `400 לא קיים חדר  <roomId>` — unknown room or no access.
- `403` — role check.

---

## 12. MappingReport — the actual mapping records

A mapping report is one line of inventory: "in this room, there are N of this sub-category, in this
condition, with this serial, expiring on this date". This is the operational payload of the whole
module.

All endpoints here are restricted to `SOUTH_COMMAND` and `SOUTH_ENDUSER` — **`SOUTH_ADMIN` is not on
the list** for any of them. Admins reach reports indirectly, since they are "all allowed" in the
group-visibility logic used by the reads.

Permissions are enforced indirectly: a report belongs to a room, the room belongs to a group, and
the caller must be allowed to see that group.

### `GET /southOperation/mappingReport`

**What it does.** Lists mapping reports matching a filter, newest first, with the sub-category
attached.

**Who can call it.** `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** Query string. **At least one parameter is required**, and unknown parameters are
rejected.

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `roomId` | optional, nullable | string | Only reports from this room |
| `groupId` | optional, nullable | string | Only reports from rooms in this group |
| `subCategoryId` | optional, nullable | string | Only reports of this sub-category |
| `categoryId` | optional, nullable | string | **Accepted but completely ignored** |

If you send both `roomId` and `groupId`, **`groupId` wins** — it overwrites the room filter.

**What happens on the server.** The filter is assembled from the query, `isAvailable = true` is
added, and reports are returned ordered by `reportedOn` descending, with the `subCategory` object
joined in.

> **Security note worth flagging:** unlike every other read in this module, **this endpoint performs
> no group-visibility check at all**. Any caller with `SOUTH_COMMAND` or `SOUTH_ENDUSER` can read
> reports from any group by passing its `groupId` or a `roomId` belonging to it. The single-report
> `GET` below *does* check. If that asymmetry is not intentional, it is worth fixing.

**Response.** `200 OK`:

```json
[
  {
    "id": "901",
    "roomId": "55",
    "reportedBy": "1111111",
    "reportedOn": "2026-09-15T09:05:00.000Z",
    "subCategoryId": "31",
    "status": "תקין",
    "description": "",
    "quantity": "4",
    "serial": "SN-12345",
    "itemPurpose": "",
    "itemTarget": "",
    "expirationDate": null,
    "isAvailable": true,
    "subCategory": { "id": "31", "categoryId": "12", "description": "מחשב נייד 14 אינץ'", "isAvailable": true }
  }
]
```

`quantity` is a decimal column and is returned as a **string**.

**Errors.**
- `400 "bad request"` — no query parameters at all, or an unknown parameter.
- `403` — role check.

---

### `GET /southOperation/mappingReport/:returnId`

**What it does.** Returns one mapping report, with a proper permission check.

**Who can call it.** `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `returnId` | **required** | string, digits only | The report ID. The name is a leftover from the returns module — it is a mapping report ID |

**What happens on the server.** The report is loaded with `isAvailable = true`. Its room is then
resolved to a group, and the caller must be allowed to see that group. Every failure — missing
report, deleted report, missing room, no access — produces the identical error, so the endpoint
never reveals which one it was.

**Response.** `200 OK` with the bare report. Unlike the list endpoint, there is **no** nested
`subCategory`.

**Errors.**
- `400 "bad request"` — `returnId` not digits-only.
- `400 לא קיים דיווח <returnId>` — "report `<returnId>` does not exist".
- `403` — role check.

---

### `POST /southOperation/mappingReport`

**What it does.** Files a new mapping report and, as a side effect, starts the mapping clock on the
room if this is the first report there.

**Who can call it.** `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are rejected. **Note that every value is sent as a string**,
including the quantity.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `roomId` | **required** | string | Which room the item was found in |
| `quantity` | **required** | string | How many. Sent as a string, stored as a decimal |
| `subCategoryId` | optional, nullable | string | What kind of item. Validated only if present |
| `status` | optional | string | Condition/status, free text |
| `description` | optional, nullable | string | Free-text notes |
| `serial` | optional, nullable | string | Serial number |
| `itemPurpose` | optional, nullable | string | What it is for |
| `itemTarget` | optional, nullable | string | Where it is headed |
| `expirationDate` | optional, nullable | string | Expiry date |
| `isAvailable` | optional | — | Accepted by the schema but ignored; always created as `true` |

`reportedBy` and `reportedOn` are **not** accepted — the server always sets them from the caller and
the current time.

**What happens on the server.**

1. The room is resolved to its group. An unknown room fails with
   `אין עמדה <roomId> בתחנה null` ("there is no position `<roomId>` in station null" — the message
   is awkward because the group is by definition unknown at that point).
2. Omitted fields are dropped rather than stored as `null`. `reportedBy`, `reportedOn` and
   `isAvailable: true` are added.
3. In parallel: the caller's access to the group is computed, the room is validated, and the
   sub-category is validated **only if one was supplied**. A report with no sub-category is
   perfectly legal.
4. A cross-check confirms the room really belongs to the resolved group.
5. Inside a transaction: the report is created, audit and export entries are written, and then —
   **if the room's status is exactly the string `waiting`** — the room is flipped to `inProgress`
   and its `startMappingTime` is stamped with the current time. This is the only place the mapping
   clock starts.

**Response.** `200 OK` with the created report, no nested objects.

**Errors.**
- `400 "bad request"` — missing `roomId` or `quantity`, or an unknown field.
- `אין עמדה <roomId> בתחנה <groupId>` — the room does not exist, or does not belong to the group it
  resolved to. Constructed without an explicit status, so it may surface as `500`.
- `400 לא קיים חדר <roomId>` — the room failed validation.
- `400 לא קיימת תת קטגוריה <id>` — the supplied sub-category does not exist.
- `400 לא קיימת קבוצה <groupId>` — the caller has no access to the room's group.
- `403` — role check.

---

### `PATCH /southOperation/mappingReport`

**What it does.** Edits an existing mapping report. The ID travels in the body. **Read the warning
below before using this endpoint** — its update behaviour is genuinely surprising.

**Who can call it.** `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.** JSON body. Unknown fields are **allowed** by this schema.

| Field | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `id` | **required** | string, digits only | Which report |
| `subCategoryId` | *see warning* | string, digits only, nullable | The sub-category |
| `status` | optional, nullable | string | New status |
| `description` | optional, nullable | string | New notes |
| `quantity` | optional, nullable | string, numeric format | New quantity |
| `serial` | optional, nullable | string | New serial |
| `itemPurpose` | optional, nullable | string | New purpose |
| `itemTarget` | optional, nullable | string | New target |
| `expirationDate` | optional, nullable | string | New expiry |
| `isAvailable` | optional | — | Accepted but never applied |

`roomId`, `reportedBy` and `reportedOn` cannot be changed.

> ### ⚠️ Two behaviours to know about
>
> **1. Nothing is updated unless `subCategoryId` is present and truthy.** The entire block that
> applies your changes sits behind a check on `subCategoryId`. If you omit it, the request still
> returns `200 OK` with the report — but **no field was changed**. Always send `subCategoryId`,
> even when it is unchanged.
>
> **2. `description` and `serial` are overwritten unconditionally.** Inside that block, those two
> fields are assigned straight from the body with no "was it provided?" guard, unlike every other
> field. Omitting them **erases** the existing values. Always resend them.
>
> The safest pattern is: read the report, merge your changes into the full object, and send the
> whole thing back.

**What happens on the server.**

1. The report is loaded by ID — **without** an `isAvailable` filter, so soft-deleted reports can be
   edited. Missing → `לא קיים דיווח <id>`.
2. Its room is resolved to a group, and the caller must be allowed to see that group.
3. The conditional update described above is applied. `quantity` is parsed from string to a floating
   point number.
4. The report is saved, and if the room is still `waiting` it is flipped to `inProgress` — note that
   unlike the create path, **`startMappingTime` is not set here**. Audit and export entries follow.

> The new `subCategoryId` is **not validated** on this path, unlike on create. You can point a
> report at a non-existent sub-category.

**Response.** `200 OK` with the report as it stands after the update.

**Errors.**
- `400 "bad request"` — missing `id`, or a badly formatted `quantity`/`subCategoryId`.
- `400 לא קיים דיווח <id>` — unknown report, or no access to its group.
- `אין חדר <roomId>2 בקבוצה null` — the report's room has vanished. (The stray `2` is a typo in the
  source; this error is also constructed without an explicit status and may surface as `500`.)
- `403` — role check.

---

### `DELETE /southOperation/mappingReport/:returnId`

**What it does.** Soft-deletes a mapping report.

**Who can call it.** `SOUTH_COMMAND`, `SOUTH_ENDUSER`.

**Input.**

| Parameter | Required? | Type | Meaning |
| --- | --- | --- | --- |
| `returnId` | **required** | string, digits only | The report to delete |

**What happens on the server.** The report is loaded (without an `isAvailable` filter, so
re-deleting is harmless), its room is resolved to a group, and the caller must be allowed to see
that group. Then, inside a transaction, `isAvailable` is set to `false` and audit and export
entries are written.

Deleting the last report in a room does **not** reset the room's status back to `waiting`.

**Response.** `200 OK` — but the body is **just the bare ID**, not an object:

```
"901"
```

This is inconsistent with the other delete endpoints, which return `{ "success": true, "id": ... }`.
Parse accordingly.

**Errors.**
- `400 "bad request"` — `returnId` not digits-only.
- `400 לא קיים דיווח <returnId>` — unknown report or no access.
- `403` — role check.

---

## Appendix A — role codes

The single-letter codes stored against each user, and the ones relevant to this module:

| Code | Role name | Role in South Operation |
| --- | --- | --- |
| `J` | `SOUTH_ADMIN` | Full administrator. "All allowed" for group visibility. Sole owner of Location and GroupCodes writes. **Not** permitted on MappingReport or SubCategory routes |
| `P` | `SOUTH_MANAGMENT` | "All allowed" for group visibility, but only appears explicitly on `GET /groupCodes` |
| `A` | `SOUTH_COMMAND` | Commander. Group-scoped. May change a group's `isAvailable` |
| `B` | `SOUTH_ENDUSER` | Field user. Group-scoped. Blocked from changing a group's `isAvailable` |
| `M` | `MARHAS` | Only on the SubCategory routes |
| `C` | `COMMANDER` | Only on the SubCategory routes |
| `O` | `OPERATION_ENDUSER` | Only on the SubCategory routes |
| `D` | `DEVELOPER` | Expands into every role above — passes every check |
| `S` | `SUPPORT` | Expands into every role above — passes every check |

Roles expand, they do not merely match. A user holding `DEVELOPER` satisfies a route requiring
`SOUTH_ENDUSER` without holding it directly.

### Quick permission matrix

| Endpoint | J | P | A | B | M/C/O |
| --- | :-: | :-: | :-: | :-: | :-: |
| `GET /itemTypes` | ✔ | | ✔ | ✔ | |
| `GET/POST/PATCH/DELETE /categories` | ✔ | | ✔ | ✔ | |
| `GET/POST/PATCH /subCategories` | | | ✔ | ✔ | ✔ |
| `GET /locations` | ✔ | | ✔ | ✔ | |
| `POST/PATCH/DELETE /locations` | ✔ | | | | |
| `GET /groupCodes` | ✔ | ✔ | ✔ | ✔ | |
| `POST/PATCH/DELETE /groupCodes` | ✔ | | | | |
| `GET/POST/PATCH /groups` | ✔ | | ✔ | ✔ | |
| `GET/PATCH /userGroup` | *any authenticated user* | | | | |
| `GET/POST/PATCH/DELETE /rooms` | ✔ | | ✔ | ✔ | |
| `GET/POST/PATCH/DELETE /mappingReport` | | | ✔ | ✔ | |

(`DEVELOPER` and `SUPPORT` pass everything and are omitted from the table.)

---

## Appendix B — known quirks and gotchas

Collected here so they are easy to find. Each of these is current behaviour in the code, not a
recommendation.

**Behaviour that will surprise you**

1. **`PATCH /mappingReport` ignores your changes unless `subCategoryId` is present**, and
   unconditionally overwrites `description` and `serial`. Always send the full object.
2. **`GET /categories` hides categories that have no available sub-categories**, because the
   sub-category join is an inner join. The same applies to the object returned by `POST` and
   `PATCH` on categories, which can come back as `null` for a category created without
   sub-categories.
3. **`PATCH /rooms` always forces `isAvailable: true`**, so patching a deleted room silently
   restores it, and you cannot delete a room this way.
4. **`PATCH /userGroup` with an empty `users` array revokes your own access** to the group. There is
   no guard.
5. **Sub-category reconciliation matches on description text, not ID.** Renaming a sub-category
   destroys the old row and creates a new one, and is blocked outright if any mapping report
   referenced the old one.
6. **`PATCH /categories` is a replace, not a merge.** Omitting `itemTypeId`, `isSpecial` or
   `subCategories` blanks them — and omitting `subCategories` entirely causes a `500`.

**Empty or unusual response bodies**

7. **All three `groupCodes` write endpoints return an empty body** (missing `return` in the response
   helper). The writes themselves succeed. Re-read with `GET /groupCodes`.
8. **`DELETE /mappingReport` returns a bare ID**, not an object.
9. **`DELETE /locations` returns `{ id }`**, without a `success` flag.
10. **`PATCH /userGroup` returns an object instead of an array** when the resulting list is empty.

**Filtering and visibility**

11. **`GET /mappingReport` performs no group-visibility check.** Any `SOUTH_COMMAND` or
    `SOUTH_ENDUSER` can read any group's reports by passing its `groupId`.
12. **`GET /subCategories` does not filter on `isAvailable`** and returns soft-deleted rows.
13. **The `userGroups` array inside `GET /groups` is not filtered on `isAvailable`** and includes
    revoked assignments.
14. **`PATCH /groups` and `PATCH /groups/delete/` do not check group assignment** — only the route's
    role check applies, so any `SOUTH_ENDUSER` can edit or delete any group by ID.
15. **Several lookups omit the `isAvailable` filter**, meaning soft-deleted records can still be
    edited and, in some cases, restored: rooms (`GET /rooms/:roomId`, `PATCH`, `DELETE`),
    mapping reports (`PATCH`, `DELETE`), groups (`PATCH`), locations (`PATCH`, `DELETE`) and
    sub-categories (`PATCH`).

**Ignored or misleading inputs**

16. **`operId` on `GET /subCategories` and `categoryId` on `GET /mappingReport` are validated but
    never used.**
17. **`createdOn` and `createdBy` on `POST /groups` are accepted and discarded** — the server always
    uses the current time and the caller.
18. **`isAvailable` in request bodies is almost always ignored.** The only endpoint where it has an
    effect is `PATCH /groups`, where it is additionally protected by a role check.
19. **`GET /rooms` accepts a non-digit `groupId`**, unlike the group endpoints which require digits.
20. **`POST /rooms` does not validate `locationId`**, and `PATCH /mappingReport` does not validate
    `subCategoryId`. Both let you point at records that do not exist.
21. **`PATCH /userGroup` does not validate identity numbers** against the user table.

**Conventions to watch**

22. **`groupCodes` responses use `identity_nums` (snake_case) while requests use `identityNums`
    (camelCase).**
23. **The `id` field in a grouped `groupCodes` response is the ID of an arbitrary underlying row**,
    not a stable identifier for the code. Address codes by `code`.
24. **Several routes put the target ID in the body rather than the URL**: `PATCH /categories`,
    `PATCH /subCategories`, `PATCH /groups`, `PATCH /groups/delete/`, `PATCH /rooms`,
    `PATCH /mappingReport`.
25. **Two delete operations are not `DELETE` requests**: `PATCH /groups/delete/` and
    `DELETE /rooms/delete/:roomId` (which has a redundant `/delete/` segment).
26. **The mapping report URL parameter is called `returnId`** — a leftover from the returns module.
27. **`POST /locations` and `POST /groupCodes` return `201`; every other create returns `200`.**
28. **`DELETE /categories` returns `404` for a missing category; every other "not found" in the
    module returns `400`.**
29. **A few errors are built without an explicit status code** (`GET /rooms/:roomId`, and two paths
    in `POST`/`PATCH /mappingReport`). These may reach the client as `500` rather than `400`, with
    the Hebrew message still intact.
30. **`DELETE /locations` runs without a transaction and writes no audit entry** — the only write in
    the module that is missing from the audit trail.
31. **The `digits` format means the string must contain digits only.** Send `"12"`, never `12`.
32. **`400 "bad request"` never says which field failed.** The detail is only in the server console.
