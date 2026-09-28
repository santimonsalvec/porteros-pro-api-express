# Research: Goalkeeper Request with One Booking per Goalkeeper

**Feature**: `010-goalkeeper-request-bookings` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

No open unknowns: runtime, stack, storage and test tiers are those of 001–009. The decisions below map the spec onto the existing 008/009 code.

---

## §1 Two collections: `goalkeeperRequests` + `bookings`

**Decision**: A new collection `goalkeeperRequests` holds one document per match (the request). The existing `bookings` collection holds one document per goalkeeper, each with `requestId`. The match snapshot (`MatchDetails`) lives on the request only. Each booking repeats `clientId`, `zoneId` and `startsAt` at the top level, written in the same transaction and never updated.

**Rationale**:
- Later features query bookings on their own:
  - the goalkeeper's open offers, by zone and start;
  - the expiry sweep, by status and start;
  - conflict checks, by goalkeeper and start.
- Those queries need indexable top-level fields on the booking.
- The copied fields are immutable after creation, so they cannot diverge from the request (FR-003).
- A separate request document gives the duplicate rule (FR-013), the preference (FR-012) and the list (FR-016) one natural home.

**Alternatives considered**:
- *Embed the bookings inside the request*: one document per match simplifies atomicity. But every later feature (acceptance, withdrawal, check-in) updates one booking and queries across bookings by goalkeeper and status. Array-element queries and per-element unique rules are awkward, and the contention of updating one document for two independent goalkeepers is avoidable.
- *Bookings only, no request document*: the preference and the per-match duplicate rule would have to be duplicated on each booking, and the list would need a `$group`.

## §2 Creation in one transaction

**Decision**: `IQuoteConfirmationStore.claimAndBook` becomes `claimAndCreateRequest(quoteId, clientId, now, build)`. Inside one `withTransaction` it runs, in order:
1. the existing conditional `findOneAndDelete` of the quote;
2. `insertOne` of the request;
3. `insertMany` of its N bookings.

`build(quote)` returns `{ request, bookings }` built by domain factories. Duplicate-key errors abort the transaction, so the quote is not deleted. They are classified by `keyPattern`:
- `quoteId` → `already_requested`;
- `clientId+zoneId+startsAt` → `duplicate_request`.

**Rationale**: Same mechanism and guarantees as 008 research §1–§2 (FR-005, FR-009, SC-001, SC-003); only the writes grow from one to 1 + N.

## §3 Uniqueness rules

**Decision** (indexes on `goalkeeperRequests`):

| Index | Definition | Enforces |
|---|---|---|
| `quoteId_unique` | `{ quoteId: 1 }` unique | ≤ 1 request per quote (FR-008/009) |
| `client_zone_start_active_unique` | `{ clientId: 1, zoneId: 1, startsAt: 1 }` unique, `partialFilterExpression: { active: true }` | ≤ 1 **active** request per client, zone and start (FR-013) |
| `client_startsAt` | `{ clientId: 1, startsAt: 1, _id: 1 }` | The client's list, as in 009 research §3 |

`active` is a **stored boolean** on the request. It is `true` at creation, and later features set it to `false` in the same transaction that ends the request's last active booking.

**Rationale**: A unique index can only filter on stored fields. The request's overall status is derived (FR-007), but "active" must be stored for the index to work. The spec defines it (FR-013: at least one booking pending or assigned), and a single place maintains it: the future state-transition code. It is always `true` in this feature.

**Alternatives considered**:
- *Enforce the duplicate rule with a query-then-insert*: racy under concurrency (SC-004).
- *Store the full derived status*: it could contradict the bookings (FR-007). A single "active" bit is the minimum the index needs.

**On `bookings`**: new index `requestId` (`{ requestId: 1, _id: 1 }`) to load a request's bookings in order. The 008/009 indexes on `bookings` (`quoteId_unique`, `client_zone_start_unique`, `client_startsAt`) are **dropped** by `BookingRepository.ensureIndexes()`, tolerating "index not found". New bookings have no `quoteId`, so the old unique index would reject the second booking of a request. Their rules moved to the request.

## §4 Price per goalkeeper

**Decision**: A new value object `GoalkeeperPrice { unitRate, unitSurcharge, total, currency }` with `total = unitRate + unitSurcharge`, validated in its constructor. `PricingSnapshot.perGoalkeeper(): GoalkeeperPrice` derives it. Each booking stores one `GoalkeeperPrice`. The request stores the full `PricingSnapshot` (the quoted total for N goalkeepers).

**Rationale**: The quote already holds per-goalkeeper amounts: `unitRate` and `unitSurcharge`, with totals equal to `unit × N`, as validated by `PricingSnapshot`. So splitting never divides and never rounds. By construction, `N × booking.total = request total` (FR-004, SC-002).

## §5 Free-cancellation period: resolved at quote time, stored on the quote

**Decision**:
- `BookingSettings` gains an optional `freeCancellationMinutes` (an integer ≥ 0), inherited city → country like the other settings. It is **not** part of `missing`, so it never blocks quoting.
- When quoting, the resolved value is stored on the `Quote` as `freeCancellationMinutes`. If neither level defines it, the value is **60** and the quote result carries `freeCancellationDefaulted: true`; the controller logs a warning with the city (same pattern as the 007 "area not configured" warnings).
- Confirmation copies the value from the quote onto the request, and computes:
  - `freeCancellationUntil = startsAt − freeCancellationMinutes`;
  - `available = now ≤ freeCancellationUntil` (inclusive boundary, see the spec edge case).

**Rationale**:
- FR-004 forbids re-reading settings at confirmation, the same "firm offer" principle as prices, and this avoids three extra reads (city → region → settings).
- The quote endpoint's response is unchanged: the value is stored, not returned (spec assumption).
- The warning is logged where the settings are resolved, at quote time, which is when operations can act.

**Alternatives considered**: Resolve at confirmation. It contradicts FR-004 and adds latency to confirmation.

**Pre-release quotes**: A stored quote without the field (issued before the release) falls back to 60 when read. In practice, the release cleanup deletes quotes, and they expire within 3 minutes anyway.

## §6 Preference

**Decision**: A request field `partialFulfillment: 'keep_confirmed' | 'cancel_all'`, default `keep_confirmed`. The confirmation body gains an optional `partialFulfillment`, validated by zod; any other value → `400 validation_failed`. On replay, the body's value is ignored and the stored one is returned (FR-012).

## §7 Derived request status

**Decision**: A pure domain function `requestStatusOf(bookings)`:

| Bookings | Status |
|---|---|
| All `pending_assignment` | `searching` |
| Some `assigned` and some `pending_assignment` | `partially_assigned` |
| No `pending_assignment` and at least one `assigned` | `assigned` |
| None `pending_assignment` or `assigned`, and at least one `completed` | `completed` |
| Otherwise (all cancelled / expired / withdrew) | `closed` |

Only `searching` occurs in this feature. The list and the confirmation answer return it (FR-007).

## §8 Replays and in-progress classification

**Decision**: Same order as 008 research §3, with the lookups moved to the request:
1. `findRequestByQuoteForClient(quoteId, clientId)`, before and after the claim;
2. if found, load its bookings by `requestId` and return `replayed`;
3. otherwise, classify as in 008: `quote_expired`, `confirmation_in_progress`, `quote_not_found`.

The duplicate refusal reports `existingRequestId`, found by `findActiveRequestByMatch(clientId, zoneId, startsAt)`.

## §9 The list over requests

**Decision**: The 009 list query becomes `ListClientRequestsQuery`. The segment counts and `find`s (`countForClient`, `findUpcomingForClient`, `findPastForClient`) move from `IBookingRepository` to a new `IGoalkeeperRequestRepository`, with the same filters, sorts and tie-breaker, over `goalkeeperRequests`. The pure `pageWindow` function is reused unchanged. After the page is fetched:
- one `findByRequestIds(ids)` loads all the page's bookings, grouped per request in `_id` order;
- names are resolved as in 009 (one zone and one city lookup).

The endpoint keeps its path, `GET /api/goalkeeper-requests/bookings`, and its query parameters.

**Rationale**: It keeps every 009 guarantee (FR-017), and adds one read per page, independent of page size.

## §10 Release cleanup instead of migration

**Decision**: No migration code (clarification 2). `quickstart.md` documents the release step:
1. Delete every document in `bookings` and `quotes` on the target database.
2. Start the new version: `ensureIndexes()` drops the obsolete `bookings` indexes and creates the new ones.

Nothing in the code reads the old booking shape.

## §11 Contract change in place

**Decision**: `POST /api/goalkeeper-requests/bookings` and `GET /api/goalkeeper-requests/bookings` change their bodies in place (clarification 1). The refusal code `duplicate_booking` becomes `duplicate_request`, with `requestId` instead of `bookingId`. The other refusal codes are unchanged. See [contracts/](./contracts/).

## §12 Testing

**Decision**: Same tiers as 008/009:
- domain unit tests (`GoalkeeperRequest`, `Booking.forRequest`, `GoalkeeperPrice`, `requestStatusOf`, `BookingSettings.freeCancellationMinutes`);
- handler tests with fakes and `FixedClock` (1 and 2 goalkeepers, preference, replay, duplicate, late notice with its inclusive boundary);
- store and repository tests with the mocked collection (transaction operations, `insertMany`, `keyPattern` classification, index definitions and drops);
- HTTP tests using `await buildTestApp()`.

Real concurrency (SC-001, SC-004) is checked manually against the dev cluster, as in 008.
