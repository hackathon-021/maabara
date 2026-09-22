# Working Notes

## P4 — scanning, load, receive, distribute

- Scanning: `<ScanOrType onCode={...} />` — camera plus keypad, hands back normalized 5-digit codes.
- The camera needs HTTPS. On the deployed URL it works; over plain HTTP from a phone it falls back to the keypad.
- Every flow sends exactly one write, at the end. A scan is validated when it is scanned, never at submit.
- Surplus at receive is only offered for a box that is `in_transit` — anything else would fail the whole unload.
- Known shortcut: no offline mode, which the distributor persona asks for. Call it out in the demo.
- **Environment note for whoever runs this next**: this build environment had no Docker/WSL2, so the usual `docker compose` test-DB path was unavailable. A real local PostgreSQL 14 (installed separately on this machine, already running as a Windows service, unrelated to this project) was used instead: created an isolated `maabara_test` database, ran `prisma migrate deploy` against it, and pointed `.env`/`.env.test` at it. `npm test` passes 265/265 across the whole repo with this DB. If you hit the same "no Docker" wall, this is a viable fallback — just don't point it at someone else's existing Postgres database, always create a fresh one.
- **What was actually verified end-to-end in this run (real server + real Postgres, via `npm run dev` + direct API calls — no browser, no phone, no camera):**
  - Pack → close two boxes in room 101: one `professional_carton` with 2 items (laptop x2, monitor x2), one `personal_carton` with none.
  - **Load**: opened a truck, loaded both boxes in one `POST /transport-units/:id/load` call, confirmed the truck went `in_transit` with a `departedAt` and a notification row (`יחידת הובלה הועמסה`). Separately confirmed the server rejects an entire load batch atomically when one code is already claimed (tried loading a valid closed code together with an already-in-transit code — got `400 VALIDATION`, nothing written) — this is the server-side half of Review Focus 4 that the client-side `classifyLoadScan` logic is built to never trigger.
  - **Receive**: received the truck with only one of its two boxes confirmed — the other came back `missingCodes: [...]`, its status flipped to `missing`, the truck was `released`, and a second notification fired. Ran a second truck through a clean full receive (no missing) for contrast — matches `receiveSummary`'s "ok" vs. "with shortfall" branching exactly.
  - **Distribute**: distributed the professional carton with only 1 of 2 laptops ticked and the monitor untouched — server returned `distributed_short`, laptop item `short` at 1/2, monitor `short` at 0/2 (an item nobody ticked comes back entirely short, matching the `shortfall()` unit tests). Distributed the personal carton with an **empty** items array — server returned plain `distributed`, no item rows, no notification. This is Review Focus 5's central claim (the identical empty request means two different things depending on whether the box has contents) confirmed live against the real lifecycle code, not just against a mock.
  - All Hebrew status/summary strings observed in the live API responses matched what the `logic.ts` functions in this workstream produce.
- **What was NOT verified in this run, and needs a human pass before the real demo** (no phones, no deployed URL, no physical room, no real camera were available in this environment):
  - Actually scanning a printed or on-screen QR label with a real camera, in the room's real lighting, at a real angle/distance.
  - The camera's duplicate-decode guard (`shouldAcceptDecode`) under a real ~10Hz decode stream — only unit-tested with synthetic timestamps.
  - Multi-phone SWR staleness (two people scanning the same truck at once).
  - The dashboard's live view of the SMS/notification rows and exception list (P5's UI) — only the underlying `notifications` table rows were checked directly via SQL.
  - Denying camera permission on a real device and completing a leg on the keypad alone.
