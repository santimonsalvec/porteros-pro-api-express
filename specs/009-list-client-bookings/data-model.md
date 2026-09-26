# Data Model: List the Client's Own Bookings (Paginated)

**Feature**: `009-list-client-bookings` | **Date**: 2026-09-25 | **Research**: [research.md](./research.md)

No new collection and no document shape change. This feature reads `bookings` (owned by 008) and the externally owned `zones` and `cities`.

---

## `Booking` — collection `bookings` (existing, read-only here)

The shape is unchanged from [008 data-model](../008-quote-to-booking/data-model.md#booking--collection-bookings). This feature reads these fields:

| Field | Used for |
|---|---|
| `_id` | Tie-breaker in the order (research §2); `bookingId` in the response |
| `clientId` | Equality filter: always the caller's `claims.sub` (FR-002, FR-003) |
| `startsAt` | Segment split (`>= now` upcoming, `< now` past) and sort key |
| `match.zoneId`, `match.cityId` | Name resolution (FR-013) |
| everything else | Copied into the response by the existing `toBookingResponse` (FR-010, FR-011) |

**New index** (`BookingRepository.ensureIndexes()`, alongside the two from 008):

| Name | Definition | Serves |
|---|---|---|
| `client_startsAt` | `{ clientId: 1, startsAt: 1, _id: 1 }` | Both counts, upcoming forward scan, past backward scan (research §3) |

## `Zone` / `City` (existing, externally owned, read-only)

Only `_id` → `name` is used.

| Port | Method | Status |
|---|---|---|
| `IZoneRepository` | `getManyByIds(ids)` | Existing, no `active` filter |
| `ICityRepository` | `getByIds(ids): Promise<City[]>` | **New**: `find({ _id: { $in: ids } })`, same pattern as `IRegionRepository.getByIds` |

---

## Ordering (FR-007)

With `now` read once per request:

```text
list = [ b ∈ client's bookings | b.startsAt >= now ]  sorted by (startsAt ↑, _id ↑)
    ++ [ b ∈ client's bookings | b.startsAt <  now ]  sorted by (startsAt ↓, _id ↓)
```

## Page window (pure function, `goalkeeperRequests/common/pageWindow.ts`)

```ts
interface PageWindow {
  upcoming: { skip: number; limit: number } | null; // null → don't query
  past: { skip: number; limit: number } | null;
}

function pageWindow(offset: number, pageSize: number, upcomingCount: number, pastCount: number): PageWindow
// offset = (page − 1) × pageSize
// upcoming part: skip = offset,                 limit = min(pageSize, U − offset)   when offset < U
// past part:     skip = max(0, offset − U),     limit = pageSize − upcomingLimit    when that is > 0 and skip < P
```

| U | P | page | size | upcoming | past |
|---|---|---|---|---|---|
| 3 | 42 | 1 | 20 | skip 0, limit 3 | skip 0, limit 17 |
| 3 | 42 | 2 | 20 | — | skip 17, limit 20 |
| 3 | 42 | 3 | 20 | — | skip 37, limit 20 (returns 5) |
| 3 | 42 | 4 | 20 | — | — (empty page) |
| 25 | 0 | 2 | 20 | skip 20, limit 5 | — |
| 0 | 0 | 1 | 20 | — | — |

`totalItems = U + P`; `totalPages = ceil(totalItems / pageSize)` (0 when there are no bookings).

---

## Application ports (`goalkeeperRequests/common/ports.ts`, additions)

```ts
interface IBookingRepository {
  // existing (008)
  findByQuoteForClient(quoteId: string, clientId: string): Promise<Booking | null>;
  findByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<Booking | null>;
  // new (009)
  countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }>;
  /** startsAt >= now, ordered (startsAt ↑, _id ↑). */
  findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]>;
  /** startsAt < now, ordered (startsAt ↓, _id ↓). */
  findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]>;
}
```

## Query and result (`goalkeeperRequests/queries/listClientBookings/`)

```ts
class ListClientBookingsQuery extends IQuery<ListClientBookingsResult> {
  constructor(readonly clientId: string, readonly page: number, readonly pageSize: number) {}
}

interface ListedBookingResponse extends BookingResponse { // BookingResponse from 008, unchanged
  zoneName: string | null;
  cityName: string | null;
}

interface ListClientBookingsResult {
  items: ListedBookingResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

There's a single success outcome and no refusal outcome: an empty list, a page past the end and missing reference data are all successes (FR-009, FR-013). Access refusals happen in middleware, and invalid input is refused in the controller.

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| Client id only from `claims.sub`; other params stripped | controller + zod `z.object` | FR-002 |
| Filter `{ clientId }` on every read | `BookingRepository` | FR-003 |
| Auth/client/complete profile | router-level middleware | FR-004 |
| `page ≥ 1` (default 1), `1 ≤ pageSize ≤ 50` (default 20), digits only | `listClientBookingsRequestSchema` | FR-005, FR-006 |
| Upcoming ↑ then past ↓, `_id` tie-break, one `now` | repository sorts + `pageWindow` + handler | FR-007 |
| Totals in every response, empty page OK | handler | FR-008, FR-009 |
| Same item shape as confirmation, stored values | `toBookingResponse` reuse | FR-010, FR-011 |
| Reads only | no write method called | FR-012 |
| Current names, `null` when missing | handler + `getManyByIds`/`getByIds` | FR-013 |
