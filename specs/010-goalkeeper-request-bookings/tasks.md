---

description: "Task list for Goalkeeper Request with One Booking per Goalkeeper"
---

# Tasks: Goalkeeper Request with One Booking per Goalkeeper

**Input**: Design documents from `/specs/010-goalkeeper-request-bookings/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/confirm-request.md, contracts/list-requests.md, quickstart.md

**Tests**: Included, following this repository's convention (001–009).
- Unit tests use hand-written fakes and `FixedClock` (`tests/fakes/fakeClock.ts`).
- Repository and store tests mock the driver `Collection` via `tests/fakes/fakeMongoCollection.ts` (`createFakeCollection`, `toArrayCursor`) and a mocked `startSession().withTransaction`.
- HTTP tests use supertest with **`await buildTestApp()`**. Never pass a bare Express app (see the step 0 fix, commit `cc82fdc`).
- No test touches a real database. Real concurrency is checked manually (Polish phase).

**Organization**:
- This feature **reshapes** existing code (008/009), so Phase 2 ports every existing behavior 1:1 to the new shape (request + one booking per goalkeeper) and ends with a **green build and green suites**.
- The user-story phases then add the new behaviors (preference, per-request duplicate, late-confirmation notice), plus the tests that prove each story independently.
- US7 was removed in `/speckit-clarify` (no migration). The release cleanup of FR-018 is a Polish task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on an incomplete task)
- **[Story]**: US1–US6 (spec.md). Setup, Foundational and Polish tasks carry no story label
- File paths are exact and match plan.md's Project Structure

---

## Phase 1: Setup

- [X] T001 Add `export const FREE_CANCELLATION_MINUTES_DEFAULT = 60;` in `src/application/features/goalkeeperRequests/common/bookingLimits.ts`, with a doc comment: "Used when neither the city nor the country configures the free-cancellation period (FR-014); a warning is logged."

---

## Phase 2: Foundational (reshape 008/009 to request + bookings)

**Purpose**: New domain types, ports, persistence, fakes and handlers ported 1:1. At the checkpoint, every existing behavior works on the new shape.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. `tsc` will be red from T008 until T021 — expected. Do T008–T021 in order.

### Domain

- [X] T002 [P] Create `src/domain/bookings/goalkeeperPrice.ts` exporting class `GoalkeeperPrice { unitRate; unitSurcharge; total; currency }`. The constructor validates:
  - `unitRate`: an integer > 0;
  - `unitSurcharge`: an integer ≥ 0;
  - `total === unitRate + unitSurcharge`;
  - `currency`: `/^[A-Z]{3}$/`.

  Each violation throws an `Error` naming the field, in the style of `pricingSnapshot.ts`. Add `tests/unit/domain/bookings/goalkeeperPrice.test.ts`, covering a valid price and each violation.
- [X] T003 [P] Add `perGoalkeeper(): GoalkeeperPrice` to `src/domain/bookings/pricingSnapshot.ts`. It returns `new GoalkeeperPrice({ unitRate, unitSurcharge, total: unitRate + unitSurcharge, currency })`. Extend `tests/unit/domain/bookings/pricingSnapshot.test.ts` with the 008 example ((55.000 + 5.000) × 2 = 120.000 → a per-goalkeeper total of 60.000) and the invariant `perGoalkeeper().total × goalkeeperCount === total` for counts 1 and 2.
- [X] T004 [P] Add a `freeCancellationMinutes: number` to `src/domain/bookings/quote.ts`:
  - `Quote.issue(…, validityMinutes, freeCancellationMinutes)` takes it as a new last parameter (an integer ≥ 0; throw otherwise);
  - `rehydrate` takes it in its props.

  Update `tests/unit/domain/bookings/quote.test.ts`, and every existing caller: `buildStoredQuote` in `tests/fixtures/quoteFixtures.ts` passes `FREE_CANCELLATION_MINUTES_DEFAULT`, and the issue-quote handler is handled in T017.
- [X] T005 [P] Create `src/domain/bookings/goalkeeperRequest.ts` per data-model.md:
  - `type PartialFulfillment = 'keep_confirmed' | 'cancel_all'` and `const PARTIAL_FULFILLMENT_OPTIONS`;
  - class `GoalkeeperRequest extends Entity<string>` with fields `clientId, quoteId, match, pricing, partialFulfillment, freeCancellationMinutes, active, quoteIssuedAt, createdAt`;
  - getters `zoneId`, `startsAt`, `goalkeeperCount`;
  - `static fromQuote(id, quote, partialFulfillment, createdAt)`, which copies from the quote and sets `active: true`;
  - `static rehydrate(props)`;
  - `freeCancellationUntil()`, which returns `startsAt − freeCancellationMinutes`;
  - `canCancelFreeAt(now)`, which returns `now ≤ freeCancellationUntil()` (inclusive).

  Add `tests/unit/domain/bookings/goalkeeperRequest.test.ts`: copying from the quote, the default fields, and the inclusive boundary (exactly at `freeCancellationUntil` → true; 1 ms after → false).
- [X] T006 Rewrite `src/domain/bookings/booking.ts` per data-model.md:
  - `type BookingStatus = 'pending_assignment' | 'assigned' | 'cancelled' | 'expired' | 'goalkeeper_withdrew' | 'completed'` (export `BOOKING_STATUSES` too);
  - class `Booking` with `requestId, clientId, zoneId, startsAt, status, price: GoalkeeperPrice, createdAt`;
  - `static forRequest(id, request: GoalkeeperRequest, createdAt)`, with status `pending_assignment` and `price = request.pricing.perGoalkeeper()`;
  - `static rehydrate(props)`.

  Remove `fromQuote`, `quoteId`, `match`, `pricing` and `quoteIssuedAt`. Rewrite `tests/unit/domain/bookings/booking.test.ts` accordingly (depends on T002, T003 and T005).
- [X] T007 [P] Create `src/domain/bookings/requestStatus.ts` with `type RequestStatus = 'searching' | 'partially_assigned' | 'assigned' | 'completed' | 'closed'` and `requestStatusOf(bookings)`, implementing the table in research.md §7. Add `tests/unit/domain/bookings/requestStatus.test.ts` with one case per table row, building bookings via `Booking.rehydrate` with the needed statuses.

### Ports and responses

- [X] T008 Update `src/application/features/goalkeeperRequests/common/ports.ts` exactly as in data-model.md "Application ports":
  - add `IGoalkeeperRequestRepository`;
  - replace `IBookingRepository` with `findByRequestIds`;
  - replace `ClaimResult` and `IQuoteConfirmationStore` (`claimAndCreateRequest`);
  - `BookingConfirmationOutcome`: rename `'duplicate_booking'` to `'duplicate_request'`;
  - the audit entry: `requestId?: string; bookingIds?: string[]` replaces `bookingId`.
- [X] T009 Create `src/application/features/goalkeeperRequests/common/requestResponse.ts`:
  - `interface BookingItemResponse { bookingId, status, unitRate, unitSurcharge, total, currency, createdAt }`;
  - `interface RequestResponse`, with the top-level fields of contracts/confirm-request.md "Success", including `status` (via `requestStatusOf`), `partialFulfillment`, `cancellation { freeCancellationUntil, freeCancellationAvailable }` and `bookings: BookingItemResponse[]`;
  - `interface ListedRequestResponse extends RequestResponse { zoneName: string | null; cityName: string | null }`;
  - `toRequestResponse(request, bookings, now)`, with bookings sorted by id and `freeCancellationAvailable = request.canCancelFreeAt(now)`.

  Delete `src/application/features/goalkeeperRequests/common/bookingResponse.ts`.

### Persistence

- [X] T010 [P] Update `src/infrastructure/persistence/mongo/quoteRepository.ts` so it maps `freeCancellationMinutes` both ways; a stored document without it reads as `FREE_CANCELLATION_MINUTES_DEFAULT` (research.md §5). Extend `tests/unit/infrastructure/persistence/mongo/quoteRepository.test.ts` (round trip + missing field → 60).
- [X] T011 [P] Create `src/infrastructure/persistence/mongo/goalkeeperRequestRepository.ts` (`GOALKEEPER_REQUESTS_COLLECTION = 'goalkeeperRequests'`):
  - `requestToDocument` / `requestFromDocument`, reusing `matchToDocument`, `matchFromDocument`, `pricingToDocument` and `pricingFromDocument` from `quoteRepository.ts`, with top-level `zoneId` / `startsAt` copies;
  - `ensureIndexes()` with the three indexes of data-model.md (exact names; `partialFilterExpression: { active: true }` on `client_zone_start_active_unique`);
  - `findByQuoteForClient`;
  - `findActiveByMatchForClient`, with filter `{ clientId, zoneId, startsAt, active: true }`;
  - `countForClient`, `findUpcomingForClient` and `findPastForClient`, moved verbatim from the 009 `bookingRepository.ts` (same filters, sorts `{ startsAt: ±1, _id: ±1 }`, skip and limit).

  Add `tests/unit/infrastructure/persistence/mongo/goalkeeperRequestRepository.test.ts`: the mapping round trip (Date types), the three index definitions, and the filters, sorts, skip and limit (move the 009 list cases from `bookingRepository.test.ts`).
- [X] T012 [P] Rewrite `src/infrastructure/persistence/mongo/bookingRepository.ts`:
  - `bookingToDocument` / `bookingFromDocument` for the new shape (`price` as a sub-document);
  - `ensureIndexes()`: first `dropIndex` for `quoteId_unique`, `client_zone_start_unique` and `client_startsAt`, ignoring errors with `code === 27` (IndexNotFound), then `createIndex({ requestId: 1, _id: 1 }, { name: 'requestId' })`;
  - `findByRequestIds(ids)`: `find({ requestId: { $in: ids } }).sort({ requestId: 1, _id: 1 })`; empty ids → `[]` without querying.

  Add `dropIndex: Mock` to `FakeMongoCollection` in `tests/fakes/fakeMongoCollection.ts`. Rewrite `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts`: the mapping, the drops (including tolerating code 27 and rethrowing other errors), the new index, and `findByRequestIds`.
- [X] T013 Rewrite `src/infrastructure/persistence/mongo/quoteConfirmationStore.ts` as `claimAndCreateRequest(quoteId, clientId, now, build)`. In one `withTransaction`:
  - `findOneAndDelete` with the same filter as today;
  - `build(quote)`;
  - `insertOne(requestToDocument(request), { session })`;
  - `insertMany(bookings.map(bookingToDocument), { session, ordered: true })`;
  - return `{ kind: 'created', request, bookings }`.

  Classify error `11000` by `keyPattern`:
  - `quoteId` → `already_requested`;
  - `zoneId` → `duplicate_request` with the attempted request's `zoneId` / `startsAt`;
  - anything else rethrows.

  Always call `endSession()`. Add `insertMany: Mock` to `FakeMongoCollection`. Rewrite `tests/unit/infrastructure/persistence/mongo/quoteConfirmationStore.test.ts`: `{ session }` on all three writes, `not_claimed`, both classifications, rethrow, `endSession`.

### Fakes, fixtures, audit

- [X] T014 [P] Create `tests/fakes/fakeGoalkeeperRequestRepository.ts` implementing `IGoalkeeperRequestRepository` with the same semantics as Mongo (the list sorts as in the 009 `fakeBookingRepository`, including the binary id comparison), plus `seed(request)` and `all()`. Rewrite `tests/fakes/fakeBookingRepository.ts` to the new port, with `seed` and `all()`.
- [X] T015 Rewrite `tests/fakes/fakeQuoteConfirmationStore.ts` for `claimAndCreateRequest` over `FakeQuoteRepository`, `FakeGoalkeeperRequestRepository` and `FakeBookingRepository`:
  - enforce "one request per quote" → `already_requested`;
  - enforce "one active request per client, zone and start" → `duplicate_request`, checked before any write so a refusal writes nothing;
  - keep the existing `failNextWith` hook.
- [X] T016 [P] Update `tests/fixtures/quoteFixtures.ts`:
  - `buildStoredQuote` gains an optional `goalkeeperCount` (1 | 2, default 2) and builds a consistent `PricingSnapshot` for it;
  - replace `buildBooking` with `buildRequest(id, startsAt, overrides)`, returning a `GoalkeeperRequest` (overrides: `clientId`, `zoneId`, `cityId`, `goalkeeperCount`, `partialFulfillment`, `freeCancellationMinutes`);
  - add `buildRequestBookings(request, ids?)`, returning its bookings via `Booking.forRequest`.
- [X] T017 [P] Update `src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommandHandler.ts` to pass `FREE_CANCELLATION_MINUTES_DEFAULT` to `Quote.issue` (US6 replaces this with the resolved setting), and adjust `tests/unit/application/features/goalkeeperRequests/issueServiceQuoteCommandHandler.test.ts`.
- [X] T018 [P] Update `src/infrastructure/observability/pinoAuditLogger.ts` (uses the reshaped entry type; nothing else changes) and `tests/fakes/fakeBookingAuditLogger.ts`.

### Handlers, controller, wiring (ported 1:1)

- [X] T019 Port `src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.ts` and `confirmBookingCommandHandler.ts`:
  - `ConfirmBookingCommand(clientId, quoteId, partialFulfillment = 'keep_confirmed')`;
  - the result union uses `request: RequestResponse` in `created` / `replayed`, and `{ outcome: 'duplicate_request'; existingRequestId: string | null }`;
  - the constructor takes `(requestRepository, bookingRepository, quoteRepository, store, idGenerator, clock, audit)`.

  Keep the exact order of research.md §8 / 008 research §3:
  1. UUID check → `quote_not_found`;
  2. replay lookup via `requestRepository.findByQuoteForClient`, loading its bookings with `bookingRepository.findByRequestIds([id])` → `replayed`;
  3. `store.claimAndCreateRequest`, with build `quote → { request: GoalkeeperRequest.fromQuote(newId, quote, command.partialFulfillment, now), bookings: N × Booking.forRequest(newId, request, now) }` (N = `quote.match.goalkeeperCount`);
  4. `duplicate_request` → `findActiveByMatchForClient` for `existingRequestId`;
  5. `not_claimed` / `already_requested` → classify as today (a concurrent winner → `replayed`; expired; in progress; not found).

  `finish()` audits `requestId` and `bookingIds`.
- [X] T020 Rename the `src/application/features/goalkeeperRequests/queries/listClientBookings/` folder to `listClientRequests/`, with files `listClientRequestsQuery.ts` (`ListClientRequestsQuery`, `ListClientRequestsResult { items: ListedRequestResponse[]; page; pageSize; totalItems; totalPages }`) and `listClientRequestsQueryHandler.ts`. The constructor takes `(requestRepository, bookingRepository, zoneRepository, cityRepository, clock)`. The logic is the same as 009 (one `now`, `countForClient`, `pageWindow`, both segments), but over requests, then:
  - one `bookingRepository.findByRequestIds(pageRequestIds)`, grouped per request;
  - names resolved as in 009;
  - items built with `toRequestResponse(request, itsBookings, now)` plus the names.
- [X] T021 Update `src/controllers/goalkeeperRequestsController.ts`:
  - `POST /bookings` sends `ConfirmBookingCommand(sub, quoteId)` (the preference arrives in US3) and maps the outcomes: `created` → 201 `result.request`; `replayed` → 200; `duplicate_request` → `409 duplicate_request` with `{ requestId: result.existingRequestId }`; the rest unchanged;
  - `GET /bookings` sends `ListClientRequestsQuery`.

  Update `src/infrastructure/di.ts`:
  - construct `GoalkeeperRequestRepository` and `await ensureIndexes()` before `BookingRepository.ensureIndexes()`;
  - pass the new dependencies;
  - register `ListClientRequestsQuery`.

  Update `tests/http/testAppFactory.ts` the same way, exposing `requestRepository` on `TestAppContext`.
- [X] T022 Port the existing tests to the new shape, keeping every assertion's intent:
  - `tests/unit/application/features/goalkeeperRequests/confirmBookingCommandHandler.test.ts` (all 008 branches: bodies now `RequestResponse`; `duplicate_booking` → `duplicate_request`);
  - rename `listClientBookingsQueryHandler.test.ts` to `tests/unit/application/features/goalkeeperRequests/listClientRequestsQueryHandler.test.ts` (seed with `buildRequest` + `buildRequestBookings`);
  - `tests/http/controllers/goalkeeperRequestsBookings.test.ts` and `tests/http/controllers/goalkeeperRequestsBookingsList.test.ts` (new body per the contracts).

**Checkpoint**: `npx tsc --noEmit -p .`, `npm test`, `npm run test:http`, `npm run test:architecture` and `npm run lint` all pass. Confirmation, replays, refusals and the list work on request + bookings.

---

## Phase 3: User Story 1 - One request and one booking per goalkeeper (Priority: P1) 🎯 MVP

**Goal**: Confirming creates 1 request + N bookings at the quoted per-goalkeeper price, all or nothing.

**Independent Test**: Confirm a 2-goalkeeper and a 1-goalkeeper quote. There must be 2 and 1 bookings at 60.000 each, sums equal to the quoted totals, and all in `pending_assignment`.

- [X] T023 [P] [US1] Add cases to `tests/unit/application/features/goalkeeperRequests/confirmBookingCommandHandler.test.ts`:
  - 2-goalkeeper quote → 1 request + 2 bookings, each `{ unitRate: 55000, unitSurcharge: 5000, total: 60000 }`, and Σ = request `total` (SC-002);
  - 1-goalkeeper quote → 1 booking;
  - the booking price is unchanged after mutating the fake rates or settings between quote and confirmation (spec US1 scenario 3);
  - `store.failNextWith(error)` → nothing is stored in any fake and the quote still exists (US1 scenario 4, SC-003);
  - the audit entry carries `requestId` and both `bookingIds`;
  - the derived `status` is `searching`.
- [X] T024 [P] [US1] Add to `tests/http/controllers/goalkeeperRequestsBookings.test.ts`: `201` with exactly the contract body for a 2-goalkeeper quote (keys, `bookings.length === 2`, Σ `bookings[].total` = `total`), and for a 1-goalkeeper quote (`bookings.length === 1`).

**Checkpoint**: US1 is proven.

---

## Phase 4: User Story 2 - Retries never create twice (Priority: P1)

**Goal**: Idempotency per `quoteId` with the new shape.

**Independent Test**: Repeated or concurrent confirmations of one 2-goalkeeper quote give exactly 1 request with 2 bookings, and every success names them.

- [X] T025 [P] [US2] Add to `confirmBookingCommandHandler.test.ts`:
  - a sequential replay → `replayed` with the same `requestId` and `bookingId`s, and no extra documents in the fakes;
  - a replay after expiry (advance `FixedClock` past `expiresAt`) → `replayed`;
  - a replay returns the bookings' **current** state (mutate a booking's status in the fake to `assigned` → the replay shows `assigned` and `status: 'partially_assigned'`);
  - a concurrent winner (store returns `already_requested`) → `replayed`;
  - still pending and not claimable → `confirmation_in_progress`;
  - another client's quote → `quote_not_found`.
- [X] T026 [P] [US2] Add to `goalkeeperRequestsBookings.test.ts`: a second `POST` with the same `quoteId` → `200`, identical `requestId` / `bookingId`s; `requestRepository.all().length === 1`; 2 bookings in total.

---

## Phase 5: User Story 3 - Partial-confirmation preference (Priority: P1)

**Goal**: The client chooses `keep_confirmed` (default) or `cancel_all` when confirming. It is stored on the request and never changed by a replay.

**Independent Test**: No preference → `keep_confirmed`; `cancel_all` → stored; an invalid value → 400; a replay with a different value → unchanged.

- [X] T027 [US3] Extend `src/controllers/requests/goalkeeperRequests/confirmBookingRequest.ts` with an optional `partialFulfillment: z.enum(PARTIAL_FULFILLMENT_OPTIONS)` whose error message lists both values. In `src/controllers/goalkeeperRequestsController.ts`, pass `parsed.data.partialFulfillment ?? 'keep_confirmed'` to `ConfirmBookingCommand`.
- [X] T028 [P] [US3] Add to `confirmBookingCommandHandler.test.ts`:
  - no preference → the stored and returned value is `keep_confirmed`;
  - `cancel_all` → stored;
  - a 1-goalkeeper quote accepts either value;
  - a replay sent with `cancel_all` for a request stored as `keep_confirmed` → still `keep_confirmed`, and nothing written.
- [X] T029 [P] [US3] Add to `goalkeeperRequestsBookings.test.ts`: the default is echoed as `keep_confirmed`; `cancel_all` is echoed; `partialFulfillment: "all"` → `400 validation_failed` with `fieldErrors.partialFulfillment`, and nothing is stored.

---

## Phase 6: User Story 4 - No duplicate active matches (Priority: P2)

**Goal**: At most one active request per client, zone and start.

**Independent Test**: A second quote for the same zone and start → `409 duplicate_request` naming the first request. The 2 bookings of one request are never refused against each other, and a different zone or start is allowed.

- [X] T030 [P] [US4] Add to `confirmBookingCommandHandler.test.ts`:
  - an active request for zone Z at 15:00 plus a different valid quote for Z at 15:00 → `duplicate_request` with `existingRequestId`; the second quote is untouched;
  - the same zone at another start, or another zone at the same start → created;
  - a 2-goalkeeper confirmation is never refused against its own bookings;
  - an inactive request (seed with `active: false`) does not block a new one (spec edge case).
- [X] T031 [P] [US4] Add to `goalkeeperRequestsBookings.test.ts`: `409` with `error: 'duplicate_request'` and `requestId` equal to the first request's id.

---

## Phase 7: User Story 5 - "My bookings" lists requests with their bookings (Priority: P2)

**Goal**: The 009 list over requests, with every 009 guarantee.

**Independent Test**: A 2-goalkeeper request tomorrow, a 1-goalkeeper request in 10 days and a past 2-goalkeeper request → 3 items in that order, each with its bookings, and totals counting requests.

- [X] T032 [P] [US5] Extend `tests/unit/application/features/goalkeeperRequests/listClientRequestsQueryHandler.test.ts`:
  - spec US5 scenario 1 (order and totals = 3);
  - each item carries its own bookings only, ordered by id, with per-goalkeeper prices;
  - `status` is derived;
  - names, including null for a missing zone or city;
  - isolation from another client's requests;
  - the page walk for R ∈ {0, 1, 20, 21, 45} mixing 1- and 2-goalkeeper requests at sizes 1, 7, 20 and 50: each request exactly once, and totals = R (SC-005);
  - bookings are loaded with **one** `findByRequestIds` call per page (spy), and none for an empty page.
- [X] T033 [P] [US5] Update `tests/http/controllers/goalkeeperRequestsBookingsList.test.ts`: the item shape matches contracts/list-requests.md (confirmation body + `zoneName` / `cityName`); the ignored `clientId`, 401/403, and the 400 cases of 009 still hold.

---

## Phase 8: User Story 6 - Late-confirmation notice (Priority: P3)

**Goal**: The free-cancellation period is resolved at quote time (city → country, default 60 with a warning), stored on the quote and request, and reported by the confirmation.

**Independent Test**: With a period of 60, a match 45 min away → `freeCancellationAvailable: false`; 3 h away → `true`, with `freeCancellationUntil = start − 60 min`. With nothing configured, 60 is used and a warning is logged.

- [X] T034 [P] [US6] Add an optional `freeCancellationMinutes` (an integer ≥ 0, else `InvalidConfigurationError`) to `src/domain/pricing/bookingSettings.ts`; map it in `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts`. Extend `tests/unit/domain/pricing/bookingSettings.test.ts` and `tests/unit/infrastructure/persistence/mongo/bookingSettingsRepository.test.ts`.
- [X] T035 [US6] Extend `resolveBookingSettings` in `src/application/features/goalkeeperRequests/common/resolveBookingSettings.ts` to return `freeCancellationMinutes: number | null` (city ?? country ?? null), **not** added to `missing`. Make `resolveAreaSettings` in `serviceArea.ts` include it in its `ok: true` result. Extend `tests/unit/application/features/goalkeeperRequests/resolveBookingSettings.test.ts` (city overrides country; absent at both → null; never in `missing`).
- [X] T036 [US6] Carry the value through the quote:
  - the `GetServiceQuoteQuery` success result (in `getServiceQuoteQuery.ts` / `getServiceQuoteQueryHandler.ts`) carries `freeCancellationMinutes: number | null`, not serialized in the response;
  - `IssueServiceQuoteCommandHandler` passes `value ?? FREE_CANCELLATION_MINUTES_DEFAULT` to `Quote.issue`, and its success result gains `freeCancellationDefaulted: boolean` and `cityId`, not serialized;
  - the controller's `/quote` route logs `logger.warn({ outcome: 'free_cancellation_not_configured', cityId }, 'Quote issued with the default free-cancellation period')` when defaulted. The response body stays unchanged.

  Extend `getServiceQuoteQueryHandler.test.ts` and `issueServiceQuoteCommandHandler.test.ts` (configured → stored value; missing → 60 and `defaulted: true`).
- [X] T037 [P] [US6] Add to `confirmBookingCommandHandler.test.ts`, with quotes stored at `freeCancellationMinutes: 60`:
  - a start 45 min after `now` → `cancellation.freeCancellationAvailable: false`;
  - 3 h → `true`, with `freeCancellationUntil = start − 60 min`;
  - exactly 60 min → `true` (inclusive);
  - the request stores the quote's value (no settings read at confirmation: the fake settings repository is not called).
- [X] T038 [P] [US6] Add to `tests/http/controllers/goalkeeperRequestsQuote.test.ts`: the quote response body is unchanged (no new keys). Add to `goalkeeperRequestsBookings.test.ts`: the `cancellation` object is present with the expected values for a configured area.

**Checkpoint**: All six stories are proven.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T039 [P] Update `src/infrastructure/openapi/openapiSpec.ts`:
  - `POST /api/goalkeeper-requests/bookings`: `partialFulfillment` in the request; new `RequestResponse` / `BookingItemResponse` schemas; `409 duplicate_request` with `requestId`;
  - `GET` (list): items = `ListedRequestResponse`;
  - remove or replace the 008 `BookingResponse` and the 009 `ListedBookingResponse` / `BookingsPageResponse` schemas accordingly.
- [X] T040 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` and `npm run test:architecture`, and fix any failure. Then run `npm run test:http` 10 times in a row: expect 0 failures.
- [ ] T041 Manual, in the dev environment, per `specs/010-goalkeeper-request-bookings/quickstart.md`:
  - §2 release cleanup (FR-018): delete `bookings` and `quotes`, start the app, and verify the indexes;
  - §4 walk-through;
  - §5 concurrency checks (SC-001, SC-004).

  Record the results in the PR description.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (T002–T007 domain; T008–T009 ports; T010–T013 persistence; T014–T018 fakes, fixtures, audit; T019–T022 handlers, controller, wiring, ported tests) → **the checkpoint must be green**.
- **US1–US4** extend the same handler test file and `goalkeeperRequestsBookings.test.ts`: parallel across files, sequential within a file. Run in priority order: US1 → US2 → US3 → US4.
- **US5** depends only on Phase 2.
- **US6** depends on Phase 2; T035 → T036; T037 needs T036's quote values.
- **Polish** last.

### Within Phase 2
- T002, T003 → T006; T005 → T006; T006 and T007 → T009.
- T008 → T011, T012, T013, T014, T015, T019, T020.
- T013 needs T011 and T012 (the mapping functions).
- T014 → T015; T016 needs T004, T005 and T006.
- T019 and T020 → T021 → T022.

### Parallel opportunities
- Domain: T002 ∥ T003 ∥ T004 ∥ T005 ∥ T007.
- Persistence: T010 ∥ T011 ∥ T012.
- T014 ∥ T016 ∥ T017 ∥ T018.
- Stories: US5 and US6 can run in parallel with US1–US4 (different files), except T037/T038, which touch the shared confirm test files.

## Parallel Example: Phase 2 domain

```bash
Task: "T002 GoalkeeperPrice"  &  Task: "T003 perGoalkeeper()"  &  Task: "T004 Quote.freeCancellationMinutes"
Task: "T005 GoalkeeperRequest"  &  Task: "T007 requestStatusOf"
# then T006 Booking rewrite
```

## Implementation Strategy

1. **Phase 1 + Phase 2** (the reshape, ported 1:1) → green checkpoint. This is the riskiest part: keep the build red for as short a time as possible by doing T008–T021 in one sitting.
2. **US1 + US2** → the MVP: the new shape proven safe.
3. **US3 + US4** → the new rules.
4. **US5** → the list proven.
5. **US6** → the late notice.
6. **Polish** → OpenAPI, repeated suite runs, manual release cleanup and concurrency checks.

## Notes

- No task writes or reads the old booking shape after the release cleanup (clarification 2).
- `pageWindow.ts` (009) is reused unchanged.
- Commit at each checkpoint.
