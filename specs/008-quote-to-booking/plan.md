# Implementation Plan: Persisted Quotes and Idempotent Booking Creation

**Branch**: `008-quote-to-booking` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-quote-to-booking/spec.md`

## Summary

`POST /api/goalkeeper-requests/quote` keeps its pricing unchanged, but now stores every successful quote in a new `quotes` collection. The stored quote holds the client, the match snapshot and the price snapshot, and is valid for 3 minutes. The response adds `quoteId` and `expiresAt`. A MongoDB **TTL index** on `expiresAt` removes unconfirmed quotes automatically, with no cleanup job.

A new endpoint, `POST /api/goalkeeper-requests/bookings` (`{ quoteId }`), turns a quote into a booking in one **MongoDB transaction**. The transaction does a conditional `findOneAndDelete` of the caller's unexpired quote, then an `insertOne` into a new `bookings` collection that copies the quote's match and price exactly. Two **unique indexes** on `bookings` (`quoteId`; `clientId + zoneId + startsAt`) are the independent guarantees against a second booking per quote and a second booking for the same match.

Idempotency comes from a replay lookup by `quoteId`, both before and after the transaction. Retries and double taps get `200` with the original booking, and a new booking is `201`. Refusals are `404 quote_not_found` (including another client's quote), `410 quote_expired`, `409 duplicate_booking` and `409 confirmation_in_progress`.

Approach, trade-offs and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged, the same runtime as the rest of this repository.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new npm dependency. Atomicity uses the `mongodb` driver's own `ClientSession.withTransaction` (research §1). Expiry uses MongoDB's native TTL index (research §4). No Redis or lock service.
**Storage**: MongoDB (Atlas replica set, so transactions are available). Two new collections owned and written by this system:
- `quotes`: short-lived, deleted on confirmation, otherwise TTL-removed after `expiresAt`.
- `bookings`: permanent in this feature.

No existing collection changes. See [data-model.md](./data-model.md).
**Testing**: Vitest, the same tiers as 001–007:
- domain unit tests (`Quote`, `Booking`, snapshots)
- handler unit tests against in-memory fakes and `FixedClock` (every §3 branch, expiry boundary, replay after expiry, duplicate match, audit)
- repository and store unit tests against the mocked `Collection` and a mocked `startSession().withTransaction`
- `supertest` HTTP tests for both routes

Real concurrency and crash atomicity (SC-001/005/008) are verified manually against the dev cluster ([quickstart.md](./quickstart.md) §4), because the project rule forbids a real database in tests (research §11).
**Target Platform**: Linux server, the same containerized Node.js process on Firebase App Hosting (`maxInstances: 1`, `concurrency: 80`). Correctness doesn't depend on a single instance: all coordination is in the database.
**Project Type**: A single backend web-service project (this repository is API only).
**Performance Goals**: SC-006, 95% of confirmations under 2 s, and quoting stays within its existing 2 s target.
- A quote adds one `insertOne`.
- A confirmation is one indexed `findOne` in the replay fast path, or one transaction (a point `findOneAndDelete` plus one `insertOne`) plus at most two point reads when refused. That's tens of milliseconds on Atlas.
**Constraints**:
- Quote deletion and booking creation are all-or-nothing (FR-011).
- A refusal changes nothing (FR-021).
- The quote price is never recomputed at confirmation (FR-013).
- `expiresAt` is stored as a BSON `Date`, which the TTL index requires.
- Validity is decided by the app `IClock` (`expiresAt > now`), never by the TTL having run (FR-020).
- Transactions need a replica set. A standalone `mongod` isn't supported for `/bookings` (quickstart §1).
**Scale/Scope**:
- New routes: 1 (`POST /bookings`); modified: 1 (`/quote` adds 2 fields).
- New handlers: 2 commands (`IssueServiceQuote`, `ConfirmBooking`).
- New domain types: 2 entities and 2 value objects.
- New infrastructure: 2 repositories and 1 transactional store.
- New ports: 4.
- Other changes: 1 constant, 1 internal field on the 007 query result, and `MongoConnectionProvider` exposes a session factory. No other feature's code path changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template. No project-specific principles have been ratified, so there are no concrete gates to evaluate. As in 007, the plan follows the discipline 001–007 established:

- **Layering**: new persistence sits behind small application-layer ports (`IQuoteRepository`, `IBookingRepository`, `IQuoteConfirmationStore`, `IBookingAuditLogger`). No MongoDB type (`ClientSession`, `Collection`, error codes) leaks into `domain`/`application`. The transaction and the `11000` → outcome mapping live in `infrastructure`. The existing layering architecture test enforces this.
- **CQRS**: the quote endpoint now writes, so it moves to a command (`IssueServiceQuoteCommand`) that reuses the unchanged pricing query through the mediator. The query itself stays side-effect free.
- **Exhaustive outcome mapping**: controllers `switch` over a discriminated `outcome` union, so an unmapped outcome fails compilation, as in 007.
- **Tests without real resources**: fakes plus mocked collections only. Database-level guarantees get a documented manual check.
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes. The design adds two entities, two value objects, four ports, one transactional adapter, and one constant. It adds no dependency. The only cross-cutting change is `MongoConnectionProvider.startSession()`, an infrastructure-internal addition.

## Project Structure

### Documentation (this feature)

```text
specs/008-quote-to-booking/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── quote-service.md     # delta over 007's contract: quoteId + expiresAt, now stores
│   └── create-booking.md    # POST /api/goalkeeper-requests/bookings
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── bookings/                                  # NEW domain area
│       ├── matchDetails.ts                        # NEW: value object (location, zone, city, start, tz, count, duration)
│       ├── pricingSnapshot.ts                     # NEW: value object, validates subtotal/surcharge/total identities
│       ├── quote.ts                               # NEW: Quote.issue(), isExpiredAt(); status 'pending'
│       └── booking.ts                             # NEW: Booking.fromQuote(); status 'pending_assignment'
│
├── application/
│   └── features/goalkeeperRequests/
│       ├── common/
│       │   ├── bookingLimits.ts                   # MODIFIED: + QUOTE_VALIDITY_MINUTES = 3
│       │   ├── ports.ts                           # MODIFIED: + IQuoteRepository, IBookingRepository,
│       │   │                                      #            IQuoteConfirmationStore (+ ClaimResult), IBookingAuditLogger
│       │   └── bookingResponse.ts                 # NEW: Booking → response DTO (flattened match + pricing)
│       ├── queries/getServiceQuote/
│       │   ├── getServiceQuoteQuery.ts            # MODIFIED: success result + area { zoneId, cityId } (not serialized)
│       │   └── getServiceQuoteQueryHandler.ts     # MODIFIED: returns area; logic unchanged
│       └── commands/                              # NEW
│           ├── issueServiceQuote/
│           │   ├── issueServiceQuoteCommand.ts        # (clientId, ServiceQuoteInput) → quote + quoteId + expiresAt | 007 refusals
│           │   └── issueServiceQuoteCommandHandler.ts # sender → GetServiceQuoteQuery; on success Quote.issue + add
│           └── confirmBooking/
│               ├── confirmBookingCommand.ts           # (clientId, quoteId) → created | replayed | refusals
│               └── confirmBookingCommandHandler.ts    # research §3 orchestration + audit
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── mongoConnectionProvider.ts             # MODIFIED: + startSession() (the client stays private)
│   │   ├── quoteRepository.ts                     # NEW: `quotes`; add, findByIdForClient; ensureIndexes → expiresAt_ttl
│   │   ├── bookingRepository.ts                   # NEW: `bookings`; find by quote/match; ensureIndexes → 2 unique
│   │   └── quoteConfirmationStore.ts              # NEW: withTransaction(findOneAndDelete + insertOne); 11000 → ClaimResult
│   ├── observability/pinoAuditLogger.ts           # MODIFIED: also implements IBookingAuditLogger
│   ├── di.ts                                      # MODIFIED: wire repos/store, ensureIndexes, 2 command handlers
│   └── openapi/openapiSpec.ts                     # MODIFIED: /quote response fields; document POST /bookings
│
└── controllers/
    ├── goalkeeperRequestsController.ts            # MODIFIED: /quote sends IssueServiceQuoteCommand(claims.sub, …);
    │                                              #           NEW POST /bookings with exhaustive outcome → status mapping
    └── requests/goalkeeperRequests/
        └── confirmBookingRequest.ts               # NEW: zod { quoteId: string } (UUID check is in the handler → 404)

tests/
├── fakes/
│   ├── fakeMongoCollection.ts                     # MODIFIED: + findOneAndDelete
│   ├── fakeQuoteRepository.ts                     # NEW
│   ├── fakeBookingRepository.ts                   # NEW
│   ├── fakeQuoteConfirmationStore.ts              # NEW: in-memory claim + unique rules over the two fakes
│   └── fakeBookingAuditLogger.ts                  # NEW: records entries
├── fixtures/
│   └── quoteFixtures.ts                           # MODIFIED: helper to build a stored Quote from the 007 world
├── unit/
│   ├── domain/bookings/                           # NEW: quote, booking, pricingSnapshot tests
│   ├── application/features/goalkeeperRequests/
│   │   ├── issueServiceQuoteCommandHandler.test.ts    # NEW
│   │   ├── confirmBookingCommandHandler.test.ts       # NEW: every §3 branch, SC-003/004/007/008 (sequential), FR-021
│   │   └── getServiceQuoteQueryHandler.test.ts        # MODIFIED: asserts area on success
│   └── infrastructure/persistence/mongo/
│       ├── quoteRepository.test.ts                # NEW: mapping (Date types), TTL index definition
│       ├── bookingRepository.test.ts              # NEW: mapping, unique index definitions
│       └── quoteConfirmationStore.test.ts         # NEW: filter, { session } on both ops, 11000 by keyPattern, endSession
└── http/
    ├── testAppFactory.ts                          # MODIFIED: register the 2 command handlers with fakes
    └── controllers/
        ├── goalkeeperRequestsQuote.test.ts        # MODIFIED: 200 body includes quoteId/expiresAt, old fields unchanged
        └── goalkeeperRequestsBookings.test.ts     # NEW: 201, 200 replay, 400/404/410/409×2, 401/403
```

**Structure Decision**: Same single-project layering as 001–007. The booking flow extends the existing `goalkeeperRequests` feature slice, which 007 deliberately named so that "later request/booking endpoints land beside the quote". The slice gets its first `commands/` folder. `Quote` and `Booking` go in a new `domain/bookings` area, separate from `domain/pricing`, which holds the externally seeded rate and settings reference data. The transactional adapter is a dedicated store rather than a method on either repository, because it spans both collections and is the only code that needs a `ClientSession`.

## Implementation notes

- **Ordering in `di.ts`**: construct `QuoteRepository` and `BookingRepository` and `await ensureIndexes()` before the server starts listening, like the other repositories. Creating a TTL or unique index on an empty new collection is instant. If `bookings` ever holds conflicting data, the unique index build fails loudly at startup, which is intended.
- **`withTransaction` return value**: in driver 7.x, `session.withTransaction(fn)` returns `fn`'s return value. Return the `ClaimResult` from the callback, and always `endSession()` in `finally`.
- **Duplicate-key classification**: read `err.code === 11000` together with `err.keyPattern` (`{ quoteId: 1 }` versus `{ clientId: 1, zoneId: 1, startsAt: 1 }`). Anything else rethrows and becomes `500`.
- **Migration**: none. Quotes issued before the release were never stored, so no old `quoteId` exists (spec edge case). The app update must read `quoteId`/`expiresAt`. Older app versions keep working because they ignore the new fields.

## Complexity Tracking

*No entries. The Constitution Check raised no violations to justify.*
