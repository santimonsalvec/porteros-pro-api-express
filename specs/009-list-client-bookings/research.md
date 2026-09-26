# Research: List the Client's Own Bookings (Paginated)

**Feature**: `009-list-client-bookings` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

The Technical Context had no open unknowns: runtime, stack, storage and test tiers are the ones 001–008 established. The decisions below settle how the clarified behavior (upcoming-then-past order, page numbers with totals, current zone/city names) maps onto the existing `bookings` collection.

---

## §1 Two-segment ordering over page-number pagination

**Decision**: Treat the caller's bookings as two segments split at `now` (read once per request):

1. **Upcoming**: `startsAt >= now`, sorted `{ startsAt: 1, _id: 1 }`
2. **Past**: `startsAt < now`, sorted `{ startsAt: -1, _id: -1 }`

The full list is `upcoming ++ past`. A page is the window `[offset, offset + pageSize)` with `offset = (page − 1) × pageSize`. The handler:

1. counts both segments in parallel (`U`, `P`; `totalItems = U + P`)
2. computes how much of the window falls in each segment with a pure function (`pageWindow`)
3. runs at most two `find` queries: upcoming with `skip(offset).limit(k)` when `offset < U`; past with `skip(max(0, offset − U)).limit(pageSize − k)` for the remainder

A page that straddles the boundary uses both queries. A page entirely in one segment uses one. A page past the end uses none.

**Rationale**: Each segment has a natural index-ordered sort, so every query is an index scan with `skip`/`limit`, and the ordering rule stays in application code where it can be unit-tested against fakes. `skip` cost is linear in the offset, but a client's history is small: SC-005 targets 500 bookings, so the worst `skip` is < 500 index keys.

**Alternatives considered**:
- *One aggregation with a computed sort key* (`$addFields: { upcoming: { $gte: ['$startsAt', now] } }` then `$sort` on it): a computed key can't use an index, so every request sorts the client's whole history in memory. It also hides the ordering rule inside a pipeline the fakes can't execute.
- *Load all the client's bookings and slice in the app*: unbounded memory per request, and the response time grows with history.
- *Cursor (keyset) pagination*: more robust to inserts between pages, but the spec settled on page numbers with totals (Assumptions), and a keyset cursor across two segments with opposite sort directions adds complexity the small data size doesn't justify.

## §2 Deterministic tie-breaker

**Decision**: `_id` (UUIDv7 booking id), ascending in the upcoming segment and descending in the past segment, mirroring the `startsAt` direction.

**Rationale**: Two bookings can share `startsAt` (different zones; FR-022 of 008 only forbids same zone + start). `_id` is unique and immutable, so the total order is strict and consecutive pages never overlap or skip (FR-007). Mirroring the direction keeps each segment a single index traversal (forward or backward) of §3's index.

**Alternatives considered**: `createdAt` (not unique); `quoteId` (unique, but not in the index).

## §3 Index

**Decision**: Add `{ clientId: 1, startsAt: 1, _id: 1 }`, named `client_startsAt`, in `BookingRepository.ensureIndexes()`.

**Rationale**: It serves all four operations:
- both counts: range on `startsAt` under an equality on `clientId`, count-covered
- the upcoming `find`: forward scan
- the past `find`: backward scan, since `{ startsAt: -1, _id: -1 }` is the exact reverse of the index

The existing `client_zone_start_unique` (`clientId, zoneId, startsAt`) can't serve a `startsAt` sort without `zoneId`. Building a non-unique index on the small `bookings` collection at startup is instant, like 008's indexes.

**Alternatives considered**: `{ clientId: 1, startsAt: 1 }` without `_id`. Mongo would then sort ties in memory on each page. That's cheap, but the three-key index makes the order fully index-provided at no real cost.

## §4 One reading of "now"

**Decision**: The handler reads `clock.now()` once and passes that same `Date` to both counts and both finds.

**Rationale**: If the counts and the finds used different instants, a match starting between them could be counted in one segment and fetched from the other, which would make `totalItems` disagree with the items. Using one instant also makes the "starts exactly now counts as upcoming" edge case (`>=`) deterministic under `FixedClock`.

## §5 Zone and city names

**Decision**: After the page is fetched, collect the distinct `zoneId`s and `cityId`s on that page and resolve them in parallel:
- `IZoneRepository.getManyByIds(zoneIds)`: existing, not filtered on `active`, so a deactivated zone still shows its name
- `ICityRepository.getByIds(cityIds)`: new, mirroring the existing `IRegionRepository.getByIds`

A missing id maps to `null` (FR-013). An empty page skips both lookups.

**Rationale**: At most two point-set reads per page, independent of page size. The names are current, as clarified. Nothing is denormalized into `bookings`, so 008 is untouched.

**Alternatives considered**:
- *`$lookup` in an aggregation*: couples the booking repository to two externally owned collections, and the fakes can't run it.
- *Per-item `getById`*: N+1 reads.
- *Snapshot names at booking time*: rejected in Clarifications.

## §6 Request validation

**Decision**: A zod schema on `req.query`, where `page` and `pageSize` are each an optional string that must be all digits and is then turned into an integer:
- `page`: at least 1, default 1
- `pageSize`: from 1 to 50, default 20

The constants `BOOKINGS_PAGE_SIZE_DEFAULT = 20` and `BOOKINGS_PAGE_SIZE_MAX = 50` go in `bookingLimits.ts`. A failure is `400 validation_failed` with per-field messages via the existing `zodFieldErrors`. Unknown query parameters (including any `clientId`/`userId`) are stripped by `z.object` and never reach the handler (FR-002).

**Rationale**: Same error body as `/config`, `/quote` and `/bookings`. The digits-only check rejects `1.5`, `-1`, `1e3` and empty strings with a clear message. A repeated parameter (`?page=1&page=2`) arrives as an array and fails the string check, so the result is never ambiguous.

**Alternatives considered**:
- *`z.coerce.number()`*: accepts `''` → 0 and `'1e1'` → 10, both surprising.
- *Clamping an oversized `pageSize` to 50*: the spec says to refuse it (FR-006).

## §7 Endpoint placement and access

**Decision**: `GET /api/goalkeeper-requests/bookings` on the existing `goalkeeperRequests` router, behind its router-level chain `requireAuth` → `requireClientOnly` → `requireCompleteProfile`. The client id is `req.authClaims.sub` only.

**Rationale**: `GET` and `POST` on the same collection resource is the REST convention. The router-level middleware gives exactly the access rules FR-004 asks for ("same as quoting and confirming") with no new code.

**Alternatives considered**: `GET /api/me/bookings`. It's a valid shape, but it would need a new router duplicating the chain, and it splits the booking resource across two prefixes.

## §8 CQRS placement and ports

**Decision**:
- A new query `ListClientBookingsQuery(clientId, page, pageSize)` and its handler under `goalkeeperRequests/queries/listClientBookings/`.
- `IBookingRepository` gains three read methods: `countForClient(clientId, now)` → `{ upcoming, past }`; `findUpcomingForClient(clientId, now, skip, limit)`; and `findPastForClient(clientId, now, skip, limit)`.
- The page arithmetic is a pure `pageWindow(offset, pageSize, upcomingCount)` function in `goalkeeperRequests/common/`.

**Rationale**: A read-only operation is a query in this codebase's CQRS split. The segment sort order is a persistence concern, so it lives in the repository. How a page spans the segments is a business rule, so it lives in the application layer. No MongoDB type crosses the port.

## §9 Observability

**Decision**: There's no audit entry. The existing request logging and OpenTelemetry HTTP instrumentation cover the endpoint.

**Rationale**: The audit log in 001/008 records state changes and security decisions. This endpoint changes nothing (FR-012), and the 401/403 refusals are already logged by the shared middleware.

## §10 Testing without a database

**Decision**: The same tiers as 008:
- `pageWindow` unit tests: segment boundary, pages past the end, zero bookings
- handler unit tests with fakes and `FixedClock`: order, straddling pages, the `>=` boundary, isolation from other clients, name resolution including missing zone/city, empty results
- repository unit tests against the mocked collection: filters, sort specs, skip/limit, the new index definition. `toArrayCursor` gains `skip`.
- `supertest` HTTP tests: 200 shape, defaults, 400 per parameter, an ignored `clientId`, 401/403

Checking that the index is actually used (`explain`) is a manual step in [quickstart.md](./quickstart.md), consistent with the project rule of no real database in tests.
