# Data Model: Goalkeeper Request with One Booking per Goalkeeper

**Feature**: `010-goalkeeper-request-bookings` | **Date**: 2026-09-27 | **Research**: [research.md](./research.md)

## `GoalkeeperRequest` — new collection `goalkeeperRequests`

One document per match.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | UUIDv7 (`requestId`) |
| `clientId` | string | The confirming caller (`claims.sub`) |
| `quoteId` | string | Unique (`quoteId_unique`); replays are matched on it |
| `zoneId` | string | Copy of `match.zoneId`, top-level for indexes |
| `startsAt` | Date | Copy of `match.startsAt`, top-level for indexes |
| `match` | `MatchDetails` | Exact copy from the quote (unchanged value object, 008) |
| `pricing` | `PricingSnapshot` | The quoted total for N goalkeepers (unchanged value object) |
| `goalkeeperCount` | `1 \| 2` | = `match.goalkeeperCount` |
| `partialFulfillment` | `'keep_confirmed' \| 'cancel_all'` | Default `keep_confirmed` |
| `freeCancellationMinutes` | integer ≥ 0 | Copied from the quote (research §5) |
| `active` | boolean | `true` at creation; later features set `false` when no booking is pending or assigned (research §3) |
| `quoteIssuedAt` | Date | The quote's `issuedAt` |
| `createdAt` | Date | `clock.now()` at confirmation |

**Indexes** (`GoalkeeperRequestRepository.ensureIndexes()`):

| Name | Definition | Enforces / serves |
|---|---|---|
| `quoteId_unique` | `{ quoteId: 1 }`, unique | FR-008/009 |
| `client_zone_start_active_unique` | `{ clientId: 1, zoneId: 1, startsAt: 1 }`, unique, partial `{ active: true }` | FR-013 |
| `client_startsAt` | `{ clientId: 1, startsAt: 1, _id: 1 }` | The client's list (FR-017) |

## `Booking` — collection `bookings` (reshaped)

One document per goalkeeper.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | UUIDv7 (`bookingId`) |
| `requestId` | string | Its request |
| `clientId` | string | Copy, immutable |
| `zoneId` | string | Copy of the request's, immutable (for later goalkeeper-side queries) |
| `startsAt` | Date | Copy of the request's, immutable |
| `status` | `BookingStatus` | See below; `pending_assignment` at creation |
| `price` | `GoalkeeperPrice` | Per-goalkeeper price (research §4) |
| `createdAt` | Date | Same instant as the request |

Removed from the 008 shape: `quoteId`, `match`, `pricing` and `quoteIssuedAt`. They now live on the request.

**Indexes** (`BookingRepository.ensureIndexes()`):
- **creates** `requestId` (`{ requestId: 1, _id: 1 }`);
- **drops**, if present: `quoteId_unique`, `client_zone_start_unique`, `client_startsAt` (research §3).

### `BookingStatus`

`pending_assignment` → later features: `assigned`, `cancelled`, `expired`, `goalkeeper_withdrew`, `completed`.

```text
pending_assignment ──accept──▶ assigned ──match ends──▶ completed
        │                         ├──client cancels──▶ cancelled
        ├──client cancels──▶ cancelled
        ├──search ends──▶ expired      └──goalkeeper withdraws──▶ goalkeeper_withdrew
```

Only the creation into `pending_assignment` happens in this feature (FR-006). The union type contains every state.

## Value objects

### `GoalkeeperPrice` (new, `src/domain/bookings/goalkeeperPrice.ts`)

| Field | Rule |
|---|---|
| `unitRate` | integer > 0 |
| `unitSurcharge` | integer ≥ 0 |
| `total` | `unitRate + unitSurcharge` (validated) |
| `currency` | ISO 4217, 3 upper-case letters |

`PricingSnapshot.perGoalkeeper(): GoalkeeperPrice` builds it from the quote snapshot. Invariant: `request.pricing.total === goalkeeperCount × booking.price.total` for every booking.

### `MatchDetails`, `PricingSnapshot`

Unchanged (008), apart from the new `perGoalkeeper()` method.

## `Quote` (extended)

A new stored field, `freeCancellationMinutes` (an integer ≥ 0), set at issuance from the resolved booking settings (default 60). When reading a stored quote without it, the value is 60 (research §5). The quote endpoint's response is unchanged.

## `BookingSettings` (extended, collection `bookingSettings`, externally seeded)

A new optional field, `freeCancellationMinutes` (an integer ≥ 0), per country or city. It resolves city → country. It is **not** in `missing`: when absent at both levels, the system uses 60 and logs a warning (FR-014).

## Domain types (TypeScript)

```ts
// src/domain/bookings/goalkeeperRequest.ts
type PartialFulfillment = 'keep_confirmed' | 'cancel_all';
class GoalkeeperRequest extends Entity<string> {
  static fromQuote(id: string, quote: Quote, partialFulfillment: PartialFulfillment, createdAt: Date): GoalkeeperRequest
  static rehydrate(props): GoalkeeperRequest
  readonly clientId, quoteId, match, pricing, partialFulfillment, freeCancellationMinutes, active, quoteIssuedAt, createdAt
  get zoneId(): string; get startsAt(): Date; get goalkeeperCount(): 1 | 2
  /** startsAt − freeCancellationMinutes */
  freeCancellationUntil(): Date
  /** now ≤ freeCancellationUntil() (inclusive) */
  canCancelFreeAt(now: Date): boolean
}

// src/domain/bookings/booking.ts (reshaped)
type BookingStatus = 'pending_assignment' | 'assigned' | 'cancelled' | 'expired' | 'goalkeeper_withdrew' | 'completed';
class Booking extends Entity<string> {
  static forRequest(id: string, request: GoalkeeperRequest, createdAt: Date): Booking   // price = request.pricing.perGoalkeeper()
  static rehydrate(props): Booking
  readonly requestId, clientId, zoneId, startsAt, status, price, createdAt
}

// src/domain/bookings/requestStatus.ts
type RequestStatus = 'searching' | 'partially_assigned' | 'assigned' | 'completed' | 'closed';
function requestStatusOf(bookings: readonly Booking[]): RequestStatus
```

## Application ports (changes in `goalkeeperRequests/common/ports.ts`)

```ts
interface IGoalkeeperRequestRepository {              // new
  findByQuoteForClient(quoteId: string, clientId: string): Promise<GoalkeeperRequest | null>;
  findActiveByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<GoalkeeperRequest | null>;
  countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }>;        // moved from IBookingRepository (009)
  findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
  findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
}

interface IBookingRepository {                        // replaced
  findByRequestIds(requestIds: string[]): Promise<Booking[]>;   // ordered by requestId, _id
}

type ClaimResult =
  | { kind: 'created'; request: GoalkeeperRequest; bookings: Booking[] }
  | { kind: 'not_claimed' }
  | { kind: 'already_requested' }
  | { kind: 'duplicate_request'; zoneId: string; startsAt: Date };

interface IQuoteConfirmationStore {
  claimAndCreateRequest(
    quoteId: string, clientId: string, now: Date,
    build: (quote: Quote) => { request: GoalkeeperRequest; bookings: Booking[] },
  ): Promise<ClaimResult>;
}

// IBookingAuditLogger entry gains requestId?: string, bookingIds?: string[] (bookingId removed)
```

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| N bookings per request, each for 1 goalkeeper | `ConfirmBookingCommandHandler` build callback | FR-001 |
| Booking price = `pricing.perGoalkeeper()`, no recalculation | `Booking.forRequest`, `GoalkeeperPrice` | FR-004 |
| Delete quote + insert request + N bookings together | store transaction | FR-005 |
| Initial state `pending_assignment` | `Booking.forRequest` | FR-006 |
| Status derived | `requestStatusOf` | FR-007 |
| Replay returns the existing request unchanged, preference untouched | handler + `findByQuoteForClient` | FR-008, FR-012 |
| Refusal reasons of 008 | handler classification | FR-010 |
| Preference enum and default | zod request schema + `GoalkeeperRequest.fromQuote` | FR-012 |
| ≤ 1 active request per client, zone and start | `client_zone_start_active_unique` | FR-013 |
| Free-cancellation period resolved at quote time, default 60 + warning | `BookingSettings`, quote handler, controller log | FR-014 |
| `freeCancellationUntil` / `available` in the answer | `GoalkeeperRequest.canCancelFreeAt` | FR-015 |
| List of requests with their bookings | `ListClientRequestsQueryHandler` | FR-016, FR-017 |
