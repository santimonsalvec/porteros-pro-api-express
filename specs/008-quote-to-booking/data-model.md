# Data Model: Persisted Quotes and Idempotent Booking Creation

**Feature**: `008-quote-to-booking` | **Date**: 2026-09-25 | **Research**: [research.md](./research.md)

Two new collections, both owned and written by this system. No existing collection changes shape.

---

## Shared value objects

Both entities embed the same two snapshots, so a booking is an exact copy of what the client accepted (FR-013).

### `MatchDetails`

| Field | Type | Source (at quote time) | Notes |
|---|---|---|---|
| `latitude` | number | request | −90…90 |
| `longitude` | number | request | −180…180 |
| `zoneId` | string | resolved zone (`area.zoneId`, research §5) | The zone the point fell in |
| `cityId` | string | zone's anchor city (`area.cityId`) | |
| `startsAt` | Date | resolved start instant | Stored as BSON `Date` (UTC) |
| `startsAtLocal` | string | `formatLocalIso` | `YYYY-MM-DDTHH:mm:ss±HH:mm`, for display only |
| `timeZone` | string | city | IANA id |
| `goalkeeperCount` | `1 \| 2` | request | |
| `durationMinutes` | `60 \| 90 \| 120` | request | |

### `PricingSnapshot`

The breakdown the quote endpoint returned, field for field (spec assumption "price breakdown mapping": `base_price` → `subtotal`, `service_fee` → `surcharge`, `total_price` → `total`).

| Field | Type | Rule |
|---|---|---|
| `unitRate` | integer | > 0 |
| `subtotal` | integer | `unitRate × goalkeeperCount` |
| `unitSurcharge` | integer | ≥ 0 |
| `surcharge` | integer | `unitSurcharge × goalkeeperCount` |
| `total` | integer | `subtotal + surcharge` |
| `currency` | string | ISO 4217, 3 upper-case letters |

The constructors validate these identities (a corrupt snapshot throws), because the booking's price is never recomputed and must be internally consistent.

---

## `Quote` — collection `quotes`

A price offer to one client for one match. It lives only while it can be confirmed (FR-023).

| Field | Type | Notes |
|---|---|---|
| `_id` | string | UUIDv7 from `IIdGenerator` (the `quoteId` returned to the app) |
| `clientId` | string | `users._id` of the caller (`claims.sub`) |
| `status` | `'pending'` | Always `pending` while stored (research §10) |
| `match` | `MatchDetails` | |
| `pricing` | `PricingSnapshot` | |
| `issuedAt` | Date | `clock.now()` when issued |
| `expiresAt` | Date | `issuedAt + QUOTE_VALIDITY_MINUTES` (3 min). **Must be a BSON Date**: the TTL index ignores other types |

**Indexes** (`QuoteRepository.ensureIndexes()`):

| Name | Definition | Purpose |
|---|---|---|
| `_id_` | default | Claim filter and lookup by id |
| `expiresAt_ttl` | `{ expiresAt: 1 }`, `expireAfterSeconds: 0` | Automatic removal of unconfirmed quotes (research §4) |

Every lookup and the claim use `{ _id, clientId }`. The `_id` index already makes them single-document point reads, so no compound index is needed.

**Lifecycle**

```text
        issue (POST /quote, success only)
               │
               ▼
          ┌─────────┐   confirm (in the transaction with the booking insert)   ┌──────────┐
          │ pending │ ────────────────────────────────────────────────────────▶│ deleted  │
          └─────────┘                                                          └──────────┘
               │   expiresAt passed  → confirmation refused as expired (not modified)
               ▼
          TTL monitor removes it (≈ ≤ 60 s after expiresAt, or later under load)
```

There's no `consumed` or `expired` stored state (spec clarification 5). "Expired" is decided purely by `expiresAt <= now` (FR-020).

---

## `Booking` — collection `bookings`

A client's confirmed request for goalkeepers for one match, created from exactly one quote. It is the only lasting record of what the client accepted.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | UUIDv7, new id (not the quote id) |
| `clientId` | string | From the quote (equals the confirming caller) |
| `quoteId` | string | The originating quote's `_id`. Unique; replays are matched on it |
| `status` | `'pending_assignment'` | Initial and only status in this feature (FR-014) |
| `zoneId` | string | Copy of `match.zoneId`, top-level for the unique index (research §2) |
| `startsAt` | Date | Copy of `match.startsAt`, top-level for the unique index |
| `match` | `MatchDetails` | Exact copy from the quote |
| `pricing` | `PricingSnapshot` | Exact copy from the quote |
| `quoteIssuedAt` | Date | The quote's `issuedAt` (the price's reference moment) |
| `createdAt` | Date | `clock.now()` at confirmation |

No payment fields: payment is out of scope, and a later feature adds its own state (spec clarification 1).

**Indexes** (`BookingRepository.ensureIndexes()`):

| Name | Definition | Enforces |
|---|---|---|
| `quoteId_unique` | `{ quoteId: 1 }`, unique | ≤ 1 booking per quote (FR-012) |
| `client_zone_start_unique` | `{ clientId: 1, zoneId: 1, startsAt: 1 }`, unique | ≤ 1 booking per client, zone and start (FR-022) |

`quoteId_unique` also serves the replay lookup `{ quoteId, clientId }`: `quoteId` matches at most one document, and `clientId` is then checked on that document.

**Lifecycle in this feature**: created in `pending_assignment` and never changed. Assignment, payment and cancellation come in future features. Because cancellation doesn't exist yet, every booking counts for the duplicate rule (FR-022). A future cancellation feature must revisit `client_zone_start_unique`, for example by turning it into a partial index on active statuses.

---

## Domain types (TypeScript, `src/domain/bookings/`)

```ts
// matchDetails.ts / pricingSnapshot.ts — immutable value objects, validated in constructors

// quote.ts
class Quote extends Entity<string> {
  static issue(id, clientId, match: MatchDetails, pricing: PricingSnapshot, issuedAt: Date, validityMinutes: number): Quote
  readonly clientId: string; readonly status: 'pending';
  readonly match: MatchDetails; readonly pricing: PricingSnapshot;
  readonly issuedAt: Date; readonly expiresAt: Date;
  isExpiredAt(now: Date): boolean            // expiresAt <= now
}

// booking.ts
type BookingStatus = 'pending_assignment';
class Booking extends Entity<string> {
  static fromQuote(id: string, quote: Quote, createdAt: Date): Booking
  readonly clientId, quoteId, status, match, pricing, quoteIssuedAt, createdAt
}
```

## Application ports (`src/application/features/goalkeeperRequests/common/ports.ts`)

```ts
interface IQuoteRepository {
  add(quote: Quote): Promise<void>;
  findByIdForClient(quoteId: string, clientId: string): Promise<Quote | null>;
}

interface IBookingRepository {
  findByQuoteForClient(quoteId: string, clientId: string): Promise<Booking | null>;
  findByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<Booking | null>; // existing id for the 409 body
}

type ClaimResult =
  | { kind: 'booked'; booking: Booking }
  | { kind: 'not_claimed' }                                       // no pending, unexpired quote of this client
  | { kind: 'already_booked' }                                    // quoteId_unique hit
  | { kind: 'duplicate_booking'; zoneId: string; startsAt: Date }; // client_zone_start_unique hit

interface IQuoteConfirmationStore {
  /** One transaction: delete the claimable quote and insert the booking built from it. */
  claimAndBook(quoteId: string, clientId: string, now: Date, newBooking: (quote: Quote) => Booking): Promise<ClaimResult>;
}

interface IBookingAuditLogger {
  logBookingConfirmation(entry: { outcome: ConfirmBookingOutcome; clientId: string; quoteId: string; bookingId?: string }): void;
}
```

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| Only successful quotes are stored | `IssueServiceQuoteCommandHandler` | FR-001, FR-004 |
| `expiresAt = issuedAt + 3 min` | `Quote.issue` + `QUOTE_VALIDITY_MINUTES` | FR-002 |
| Claim only own, unexpired quote (`expiresAt > now`) | `findOneAndDelete` filter | FR-009, FR-010, FR-020 |
| Delete + insert together or not at all | transaction | FR-011 |
| ≤ 1 booking per quote | `quoteId_unique` | FR-012 |
| Booking copies match and pricing, no recalculation | `Booking.fromQuote` | FR-013 |
| ≤ 1 booking per client, zone and start | `client_zone_start_unique` | FR-022 |
| Refusal leaves the quote untouched | aborted transaction / read-only classification | FR-021 |
| Unconfirmed quotes removed by the database | `expiresAt_ttl` | FR-023 |
