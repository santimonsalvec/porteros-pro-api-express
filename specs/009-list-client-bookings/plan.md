# Implementation Plan: List the Client's Own Bookings (Paginated)

**Branch**: `009-list-client-bookings` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-list-client-bookings/spec.md`

## Summary

A new endpoint, `GET /api/goalkeeper-requests/bookings?page=&pageSize=`, returns the caller's bookings, one page at a time. The caller is always `claims.sub`, and it sits behind the same middleware chain as `POST /quote` and `POST /bookings`.

The order is **upcoming matches first** (`startsAt ≥ now`, soonest first), then **past matches** (most recent first), with the booking `_id` as tie-breaker. The handler reads `now` once and counts both segments. A pure `pageWindow` function decides how the requested page spans them, and at most two indexed `find` queries with `skip`/`limit` fetch it. A new index `{ clientId: 1, startsAt: 1, _id: 1 }` serves the counts and both sort directions.

Each item is the existing 008 booking response plus `zoneName`/`cityName`. Those are resolved from the current `zones`/`cities` data with one batched lookup each per page, and are `null` when missing. The response carries `page`, `pageSize`, `totalItems` and `totalPages`.

Approach, trade-offs and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged, the same runtime as the rest of this repository.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new npm dependency.
**Storage**: MongoDB. No new collection and no shape change. It reads `bookings` (owned by 008) and adds one non-unique index, `client_startsAt`. It also reads `zones` and `cities` (externally owned) for names.
**Testing**: Vitest, the same tiers as 001–008:
- `pageWindow` unit tests
- handler unit tests against fakes and `FixedClock`
- repository unit tests against the mocked `Collection` (`toArrayCursor` gains `skip`)
- `supertest` HTTP tests

Index usage is verified manually with `explain` ([quickstart.md](./quickstart.md) §4). There's no real database in tests.
**Target Platform**: Linux server, the same containerized Node.js process on Firebase App Hosting.
**Project Type**: A single backend web-service project (this repository is API only).
**Performance Goals**: SC-005, any page within 1 s (p95) for a client with up to 500 bookings. The cost is two index-covered counts in parallel, at most two index-ordered `find`s (≤ 50 docs), and at most two `$in` lookups in parallel: a few tens of milliseconds on Atlas.
**Constraints**:
- Read-only (FR-012).
- The client id comes from the token only (FR-002).
- Stored values are returned as is (FR-011).
- A missing zone or city never fails the request (FR-013).
**Scale/Scope**: Per-client history in the tens to low hundreds of bookings. `skip` is bounded by it (research §1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template, so there are no ratified gates. As in 007 and 008, the plan follows the discipline 001–008 established:

- **Layering**: the new reads sit behind the existing application ports (`IBookingRepository` +3 methods, `ICityRepository` +1). No MongoDB type (`Filter`, `Sort`, cursors) leaks into `domain`/`application`, and the layering architecture test enforces it.
- **CQRS**: a read-only operation, so a new **query** (`ListClientBookingsQuery`) dispatched through the mediator.
- **Business rules in the application layer**: the segment split and page arithmetic (`pageWindow`) are pure and unit-tested. The repository only knows how to sort one segment.
- **Tests without real resources**: fakes plus the mocked collection. The index check is a documented manual step.
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes. The design adds one query and its handler, one pure helper, one request schema, four port methods (3 booking + 1 city) with their Mongo and fake implementations, and one index. There's no new collection, entity or dependency, and 008's write path is untouched.

## Project Structure

### Documentation (this feature)

```text
specs/009-list-client-bookings/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/
│   └── list-bookings.md # GET /api/goalkeeper-requests/bookings
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── application/
│   └── features/
│       ├── locations/common/
│       │   └── ports.ts                           # MODIFIED: ICityRepository + getByIds(ids)
│       └── goalkeeperRequests/
│           ├── common/
│           │   ├── bookingLimits.ts               # MODIFIED: + BOOKINGS_PAGE_SIZE_DEFAULT = 20, BOOKINGS_PAGE_SIZE_MAX = 50
│           │   ├── ports.ts                       # MODIFIED: IBookingRepository + countForClient,
│           │   │                                  #           findUpcomingForClient, findPastForClient
│           │   ├── pageWindow.ts                  # NEW: pure (offset, size, U, P) → { upcoming?, past? } skip/limit
│           │   └── bookingResponse.ts             # MODIFIED: + ListedBookingResponse (BookingResponse + zoneName/cityName)
│           └── queries/listClientBookings/        # NEW
│               ├── listClientBookingsQuery.ts         # (clientId, page, pageSize) → items + page/pageSize/totalItems/totalPages
│               └── listClientBookingsQueryHandler.ts  # now once → counts → pageWindow → finds → name lookups
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── bookingRepository.ts                   # MODIFIED: + client_startsAt index; 3 read methods
│   │   └── cityRepository.ts                      # MODIFIED: + getByIds ($in)
│   ├── di.ts                                      # MODIFIED: register ListClientBookingsQuery handler
│   └── openapi/openapiSpec.ts                     # MODIFIED: document GET /bookings next to POST /bookings
│
└── controllers/
    ├── goalkeeperRequestsController.ts            # MODIFIED: NEW GET /bookings (claims.sub → query → 200)
    └── requests/goalkeeperRequests/
        └── listClientBookingsRequest.ts           # NEW: zod { page?, pageSize? } digits-only, ranges, defaults

tests/
├── fakes/
│   ├── fakeMongoCollection.ts                     # MODIFIED: toArrayCursor + skip
│   ├── fakeBookingRepository.ts                   # MODIFIED: 3 read methods (same order/filters as Mongo)
│   └── fakeCityRepository.ts                      # MODIFIED: + getByIds
├── unit/
│   ├── application/features/goalkeeperRequests/
│   │   ├── pageWindow.test.ts                     # NEW: data-model table + edge rows
│   │   └── listClientBookingsQueryHandler.test.ts # NEW: order, straddling pages, >= boundary, isolation,
│   │                                              #      names incl. missing, empty, totals (SC-001..004)
│   └── infrastructure/persistence/mongo/
│       ├── bookingRepository.test.ts              # MODIFIED: filters, sort specs, skip/limit, new index definition
│       └── cityRepository.test.ts                 # MODIFIED: getByIds filter
└── http/
    ├── testAppFactory.ts                          # MODIFIED: register the query handler with fakes
    └── controllers/
        └── goalkeeperRequestsBookingsList.test.ts # NEW: 200 shape + defaults, 400 per param, ignored clientId, 401/403
```

**Structure Decision**: Same single-project layering as 001–008. The endpoint extends the `goalkeeperRequests` feature slice beside `POST /bookings`, and the slice gets its first booking read under `queries/`. The existing `toBookingResponse` is reused, so the item shape can't drift from the confirmation response (FR-010).

## Implementation notes

- **`now` once**: the handler passes the same `Date` to `countForClient` and both `find…` calls (research §4). The upcoming filter uses `$gte`, and the past filter uses `$lt`.
- **Sort specs**: upcoming `{ startsAt: 1, _id: 1 }` and past `{ startsAt: -1, _id: -1 }`. These are the exact forward and reverse of `client_startsAt`, so neither needs an in-memory sort.
- **Counts**: `countDocuments` on `{ clientId, startsAt: { $gte: now } }` and `{ clientId, startsAt: { $lt: now } }`, run in parallel with `Promise.all`.
- **Name lookups**: dedupe the page's `zoneId`s and `cityId`s, skip both when the page is empty, and run them in parallel. Map by id, and default to `null`.
- **`totalPages`**: `Math.ceil(totalItems / pageSize)`, which is naturally `0` for no bookings.
- **Controller**: parse `req.query` with the new schema (on failure, `400 validation_failed` with `zodFieldErrors`), then send `ListClientBookingsQuery(req.authClaims!.sub, page, pageSize)` and return `200` with the result. There's no outcome switch, because the query has a single success shape (data-model).
- **Migration**: none. The new index builds at startup, and existing bookings are listed as they are.

## Complexity Tracking

*No entries. The Constitution Check raised no violations to justify.*
