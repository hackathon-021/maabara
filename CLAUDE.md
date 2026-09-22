# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project: המעברה (HaMa'avara)

**⚠️ HACKATHON MVP — this is a proof-of-concept built for a hackathon, not a production system.**
Prioritize speed, working end-to-end demos, and clarity over robustness, scalability, or full security hardening. When in doubt between "quick and demoable" and "correct and complete," prefer the former and leave a `// TODO` note explaining the shortcut.

### Problem Statement

The army is executing a large-scale relocation ("מבצע המעבר דרומה") — evacuating and transporting tens of thousands of items of professional equipment, lab gear, office equipment, and personal gear from one base to another.

- **Phase A** (room content mapping) is already complete.
- **Phase B**, which this system supports, covers the physical evacuation chain end-to-end: **packing → loading & transport → receiving & unloading → distribution into destination rooms.**

Two user groups experience this problem differently:

1. **Soldiers / packers in the field** — today stuck with a slow, error-prone, manual process: endless manual item tagging, picking from long lists, and operating a system while physically carrying boxes. This creates bottlenecks, truck delays, and loss of sensitive equipment.
2. **Relocation commanders & logistics/admin staff** — need full command and control over a complex operation, but today lack a reliable, real-time unified picture: which rooms are ready, where trucks are en route, and which items are missing or lost during unloading.

**Goal:** design and build, from scratch, an innovative, smart system to manage the evacuation, transport, and receiving chain. It must make field operations (packing, tagging, receiving, distribution) fast, simple, and nearly frictionless, while giving relocation staff and commanders a live, accurate, insight-driven control picture — with zero equipment loss.

The system must be operationally independent, fast, and secure, ensuring functional continuity throughout the move.

---

## Repository Structure — READ BEFORE YOU START

Before planning or writing any code, **explicitly consult these folders**. Do not guess at flows, personas, data model, or design conventions — they are already defined in the repo.

| Folder | Purpose | When to consult |
|---|---|---|
| `/flows` | Describes the end-to-end system processes for each user type (packer, driver, receiver, commander, etc.) | Before implementing any feature — confirm the flow it belongs to |
| `/personas` | Defines all customer/user types (field soldier, packer, driver, room officer, ops commander, etc.) | Before designing any screen or interaction — confirm whose need it serves |
| `/wiki` | Contains the ERD (data model) and the API specification for the system | Before touching the data layer or any API endpoint — this is the source of truth for schema and contracts |
| `/skills` | Describes system capabilities/features | Before scoping a feature — check whether it's already defined here |
| `/design` | The system's design/UI template and visual language | Before building any UI component — follow this, do not invent a new style |

**Rule of thumb:** if a task touches user experience → check `/flows` + `/personas` + `/design`. If it touches data or backend → check `/wiki`. If it touches scope/capabilities → check `/skills`.

---

## Language & Documentation Conventions

- Code, identifiers, comments, and this file: **English**.
- Product/domain content that originates from Hebrew source material (e.g., persona names, flow descriptions copied from `/flows` or `/personas`) may remain in Hebrew where translating would lose meaning — but prefer English summaries in generated docs when possible.

---

## Output / Artifact Locations

Generated planning and documentation artifacts must be exported to the following fixed locations (create the folder if it doesn't exist) — **do not scatter generated docs elsewhere in the repo:**

```
/docs/generated/
  ├── plan.md        # Implementation / sprint plan
  ├── wiki.md         # Consolidated system wiki export (derived from /wiki, kept in sync)
  ├── flows.md        # Consolidated flows export (derived from /flows)
  └── notes.md        # Any other working notes, decisions, or open questions
```

- `plan.md` — always written/updated here when asked to "plan" or "break down" work.
- `wiki.md` — a consolidated, readable export of the ERD + API docs from `/wiki`, regenerated when the data model or API changes.
- Any other one-off generated artifact (e.g., a migration script, a demo script) should be placed in `/docs/generated/` unless the user specifies otherwise.

---

## Working Principles for This MVP

1. **Zero equipment loss** is the core non-negotiable requirement — every feature that touches item tracking should preserve traceability of an item's location/status, even under a rushed MVP build.
2. **Field usability first** — packers and drivers operate the system while physically handling boxes; interactions must be fast, low-friction, and minimize manual list-scrolling/typing (e.g., prefer scanning/tagging patterns over manual entry where feasible).
3. **Live operational picture** — commanders/admin staff need real-time status (room readiness, truck location, missing/lost items) — treat this as a first-class read path, not an afterthought.
4. Follow the data model and API contracts in `/wiki` as the single source of truth; don't invent new entities without checking there first.
5. Follow `/design` for all UI — don't introduce ad-hoc styling.
