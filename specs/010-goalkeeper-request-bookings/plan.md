# Implementation Plan: Goalkeeper Request with One Booking per Goalkeeper

**Branch**: `010-goalkeeper-request-bookings` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-goalkeeper-request-bookings/spec.md`

## Summary

Confirming a quote (`POST /api/goalkeeper-requests/bookings`) now creates, in **one MongoDB transaction**:
- the conditional delete of the quote (unchanged from 008);
- a **request** document in a new `goalkeeperRequests` collection, holding the match snapshot, the full quoted price, the client's `partialFulfillment` preference, the free-cancellation period and an `active` flag;
- **N booking** documents in `bookings`, one per goalkeeper. Each carries its `requestId`, a status (`pending_assignment`) and a per-goalkeeper `GoalkeeperPrice` derived from the quote, never divided or recalculated.

Uniqueness rules move to the request:
- `quoteId` is unique, which keeps idempotency;
- a **partial unique index** on `clientId + zoneId + startsAt` where `active: true` enforces "no duplicate active match".

The free-cancellation period is a new optional booking setting (city → country). It is resolved and stored **at quote time**, defaulting to 60 min with a logged warning. At confirmation, the answer reports `freeCancellationUntil` and whether it is still available.

The 009 list keeps its path and guarantees but paginates **requests**, loading each page's bookings in one query. The contract changes in place. There is no migration: existing bookings and quotes are deleted at release, and `ensureIndexes()` drops the obsolete booking indexes.

Decisions and rejected alternatives: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new dependency.
**Storage**: MongoDB (Atlas replica set, transactions available).
- New collection `goalkeeperRequests`.
- `bookings` is reshaped: one document per goalkeeper, with obsolete indexes dropped.
- `quotes` gains a stored field.
- The externally seeded `bookingSettings` gains an optional field.

See [data-model.md](./data-model.md).
**Testing**: Vitest, same tiers as 008–009:
- domain unit tests;
- handler tests with fakes and `FixedClock`;
- store and repository tests with the mocked collection;
- supertest HTTP tests via `await buildTestApp()`.

Real concurrency is checked manually ([quickstart.md](./quickstart.md) §5).
**Target Platform**: Linux server, Firebase App Hosting (Cloud Run). Unchanged.
**Project Type**: Single backend web service.
**Performance Goals**: Unchanged targets.
- Confirmation: one transaction with 1 delete + 1 insert + 1 `insertMany` (≤ 2 documents).
- List: the 009 costs plus one `$in` read of the page's bookings.
**Constraints**:
- all-or-nothing creation (FR-005);
- no re-read of settings or rates at confirmation (FR-004);
- the request's status is derived, never stored (FR-007), except for the `active` flag the index needs (research §3).

**Scale/Scope**: As 009 (a client's history in the tens or hundreds of requests).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template. As in 007–009, the plan follows the discipline 001–009 established:

- **Layering**: new persistence behind application ports (`IGoalkeeperRequestRepository`; `IBookingRepository` and `IQuoteConfirmationStore` reshaped). No MongoDB type leaks into `domain`/`application`; the architecture test enforces it.
- **Rules in the domain**: the per-goalkeeper split (`PricingSnapshot.perGoalkeeper`, `GoalkeeperPrice`), `Booking.forRequest`, `GoalkeeperRequest.fromQuote`, `canCancelFreeAt` and `requestStatusOf` are pure and unit-tested.
- **CQRS**: confirmation stays a command; the list stays a query.
- **Exhaustive outcome mapping** in the controller.
- **Tests without real resources**; the database-level guarantees get a documented manual check.
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes.
- Added: one entity (`GoalkeeperRequest`), one value object (`GoalkeeperPrice`), one domain function (`requestStatusOf`), one repository and one optional setting.
- Changed: `Booking`, the confirmation store, the list query and two contracts, in place as clarified.

## Project Structure

### Documentation (this feature)

```text
specs/010-goalkeeper-request-bookings/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (includes the release cleanup)
├── contracts/
│   ├── confirm-request.md   # POST /api/goalkeeper-requests/bookings (reshaped)
│   └── list-requests.md     # GET  /api/goalkeeper-requests/bookings (reshaped from 009)
├── checklists/requirements.md
└── tasks.md             # /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/
│   │   ├── goalkeeperPrice.ts                     # NEW: per-goalkeeper price VO
│   │   ├── pricingSnapshot.ts                     # MODIFIED: + perGoalkeeper()
│   │   ├── quote.ts                               # MODIFIED: + freeCancellationMinutes
│   │   ├── goalkeeperRequest.ts                   # NEW: fromQuote, freeCancellationUntil, canCancelFreeAt, active
│   │   ├── booking.ts                             # REWRITTEN: 1 goalkeeper, requestId, BookingStatus union, forRequest
│   │   └── requestStatus.ts                       # NEW: requestStatusOf(bookings)
│   └── pricing/bookingSettings.ts                 # MODIFIED: + optional freeCancellationMinutes (validated)
│
├── application/features/goalkeeperRequests/
│   ├── common/
│   │   ├── bookingLimits.ts                       # MODIFIED: + FREE_CANCELLATION_MINUTES_DEFAULT = 60
│   │   ├── resolveBookingSettings.ts              # MODIFIED: resolves freeCancellationMinutes (not in `missing`)
│   │   ├── serviceArea.ts                         # MODIFIED: resolveAreaSettings returns freeCancellationMinutes | null
│   │   ├── ports.ts                               # MODIFIED: + IGoalkeeperRequestRepository; IBookingRepository,
│   │   │                                          #   ClaimResult, IQuoteConfirmationStore, audit entry reshaped
│   │   ├── requestResponse.ts                     # NEW (replaces bookingResponse.ts): request + bookings[] + cancellation; ListedRequestResponse (+ names)
│   │   └── bookingResponse.ts                     # REMOVED
│   ├── queries/getServiceQuote/                   # MODIFIED: success result carries freeCancellationMinutes | null
│   ├── commands/issueServiceQuote/                # MODIFIED: stores resolved period (default 60) on the Quote; result flags `freeCancellationDefaulted`
│   ├── commands/confirmBooking/                   # MODIFIED: partialFulfillment input; builds request + N bookings; replay/duplicate by request
│   └── queries/listClientBookings/ → listClientRequests/   # RENAMED + MODIFIED: paginates requests, loads page bookings, names
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── goalkeeperRequestRepository.ts         # NEW: mapping, 3 indexes, lookups, list reads (moved from bookingRepository)
│   │   ├── bookingRepository.ts                   # REWRITTEN: new mapping, requestId index, drops obsolete indexes, findByRequestIds
│   │   ├── quoteRepository.ts                     # MODIFIED: maps freeCancellationMinutes (missing → 60)
│   │   ├── quoteConfirmationStore.ts              # MODIFIED: claimAndCreateRequest (delete + insertOne + insertMany), keyPattern classification
│   │   └── bookingSettingsRepository.ts           # MODIFIED: maps freeCancellationMinutes
│   ├── observability/pinoAuditLogger.ts           # MODIFIED: requestId / bookingIds in the entry
│   ├── di.ts                                      # MODIFIED: new repository + ensureIndexes, renamed query handler
│   └── openapi/openapiSpec.ts                     # MODIFIED: both contracts
│
└── controllers/
    ├── goalkeeperRequestsController.ts            # MODIFIED: partialFulfillment; duplicate_request; list query rename; warning log for defaulted period
    └── requests/goalkeeperRequests/confirmBookingRequest.ts   # MODIFIED: + optional partialFulfillment enum

tests/
├── fakes/            # fakeBookingRepository (reshaped), fakeGoalkeeperRequestRepository (NEW), fakeQuoteConfirmationStore (reshaped)
├── fixtures/quoteFixtures.ts                      # MODIFIED: buildRequest / buildBooking helpers
├── unit/domain/bookings/                          # goalkeeperPrice, goalkeeperRequest, booking, requestStatus, pricingSnapshot.perGoalkeeper
├── unit/domain/pricing/bookingSettings.test.ts    # freeCancellationMinutes validation
├── unit/application/features/goalkeeperRequests/  # confirm handler, issue quote handler, list requests handler, resolveBookingSettings
├── unit/infrastructure/persistence/mongo/         # request repo, booking repo (drops), store (insertMany, classification), quote repo
└── http/controllers/                              # goalkeeperRequestsBookings.test.ts, goalkeeperRequestsBookingsList.test.ts (reshaped)
```

**Structure Decision**: Same single-project layering.
- `GoalkeeperRequest` lives in `domain/bookings` beside `Booking` and `Quote`.
- The confirmation keeps its command name (`ConfirmBookingCommand`), because the route and the user's action ("confirm") are unchanged.
- The list query is renamed to `ListClientRequestsQuery`, because it now returns requests.

## Implementation notes

- **Transaction** (`claimAndCreateRequest`): `findOneAndDelete(quote)` → `insertOne(request)` → `insertMany(bookings, { ordered: true })`, all with `{ session }`. Classify error `11000` by `keyPattern`:
  - `quoteId` → `already_requested`;
  - `clientId` + `zoneId` + `startsAt` → `duplicate_request`.
  - Anything else rethrows (500).
- **Dropping indexes**: `BookingRepository.ensureIndexes()` calls `dropIndex(name)` for each obsolete name, ignoring `IndexNotFound` (code 27), **before** creating `requestId`. This is safe on an empty collection after the cleanup, and harmless when repeated.
- **Replay body**: always rebuilt from the stored request plus its bookings as they are now, never cached. The `partialFulfillment` of a replay body is ignored.
- **Warning log**: when the issued quote reports `freeCancellationDefaulted`, the controller logs `logger.warn({ outcome: 'free_cancellation_not_configured', cityId }, …)`, like the 007 configuration warnings. The quote response is unchanged.
- **Audit**: `logBookingConfirmation({ outcome, clientId, quoteId, requestId?, bookingIds? })`. The outcome `duplicate_booking` is renamed `duplicate_request`.
- **Release**: [quickstart.md](./quickstart.md) §2 (delete `bookings` and `quotes`, then start the new version).

## Complexity Tracking

*No entries. The Constitution Check raised no violations to justify.*
