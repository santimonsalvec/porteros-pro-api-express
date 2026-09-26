---

description: "Task list for Persisted Quotes and Idempotent Booking Creation"
---

# Tasks: Persisted Quotes and Idempotent Booking Creation

**Input**: Design documents from `/specs/008-quote-to-booking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/create-booking.md, contracts/quote-service.md, quickstart.md

**Tests**: Included, following this repository's convention (`specs/001`–`007`) of a test task per domain type, handler, repository and endpoint.
- Unit tests use hand-written fakes (no mocking library for application code).
- Repository and store tests mock the MongoDB driver's `Collection` via `tests/fakes/fakeMongoCollection.ts` and a mocked `startSession()`.
- HTTP tests use `supertest` against `tests/http/testAppFactory.ts`.
- No test ever touches a real database (research.md §11). The database-backed guarantees (SC-001, SC-005, SC-008 concurrent) are verified manually in the Polish phase.

**Organization**: Tasks are grouped by user story (from spec.md).
- **Phases run in dependency order, not priority order.** US3 (quote recording, P2) goes first because it produces the stored quotes the other stories confirm. The spec calls it "the prerequisite for Stories 1 and 2 … it can be shipped and tested first".
- **The confirmation handler `confirmBookingCommandHandler.ts` is built incrementally:**
  - US1 lays down the success path.
  - US2 adds the replay lookups and the in-progress branch.
  - US4 adds the expired, not-found and duplicate classifications, in the positions research.md §3 gives them.
- The result union and the controller mapping are complete from US1, so later stories only add handler branches and tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US4). Setup, Foundational and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`. Imports use the repo's `.js` extension convention (`NodeNext`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new directories. research.md confirms zero new npm packages and no new environment variable.

- [X] T001 Create the empty directory scaffold per `plan.md`'s Project Structure: `src/domain/bookings/`, `src/application/features/goalkeeperRequests/commands/issueServiceQuote/`, `src/application/features/goalkeeperRequests/commands/confirmBooking/`, `tests/unit/domain/bookings/`
- [X] T002 [P] Confirm no `package.json`, `.env`, `.env.example` or `src/infrastructure/config.ts` change is required (plan.md Technical Context), and that the database behind `MONGODB_CONNECTION_STRING` is a replica set, so transactions work: it's Atlas `mongodb+srv://…mongodb.net`. Record the result in `specs/008-quote-to-booking/quickstart.md` §1 if anything differs

**Checkpoint**: Directory structure ready; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The domain types, ports, repositories, index definitions and test fakes that every user story uses. Nothing here changes existing behavior. The new repositories are wired only for `ensureIndexes()`, and no route uses them yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Domain and ports

- [X] T003 [P] Create the immutable `MatchDetails` value object in `src/domain/bookings/matchDetails.ts`, per `data-model.md` § MatchDetails.
  - Fields: `latitude`, `longitude`, `zoneId`, `cityId`, `startsAt: Date`, `startsAtLocal: string`, `timeZone`, `goalkeeperCount: GoalkeeperCount`, `durationMinutes: DurationMinutes`.
  - Import the two types from `src/application/features/goalkeeperRequests/common/bookingLimits.ts` only if the layering test allows it. Otherwise declare the literal unions `1 | 2` and `60 | 90 | 120` locally: domain must not import application (`tests/architecture/layering.test.ts`).
  - The constructor throws `Error` when latitude/longitude are out of range, `startsAt` is an invalid `Date`, or `zoneId`/`cityId`/`timeZone` are empty.
- [X] T004 [P] Create the immutable `PricingSnapshot` value object in `src/domain/bookings/pricingSnapshot.ts`, per `data-model.md` § PricingSnapshot.
  - Fields: `unitRate`, `subtotal`, `unitSurcharge`, `surcharge`, `total`, `currency`.
  - The constructor takes `goalkeeperCount` for validation and throws `Error` unless all of these hold: every amount is a non-negative integer, `unitRate > 0`, `subtotal === unitRate × goalkeeperCount`, `surcharge === unitSurcharge × goalkeeperCount`, `total === subtotal + surcharge`, and `currency` matches `/^[A-Z]{3}$/`.
- [X] T005 Create the `Quote` entity (extends `Entity<string>` from `src/domain/common/entity.ts`) in `src/domain/bookings/quote.ts` (depends on T003, T004).
  - Fields: `clientId`, `status: 'pending'`, `match`, `pricing`, `issuedAt`, `expiresAt`.
  - `static issue(id, clientId, match, pricing, issuedAt, validityMinutes)` sets `expiresAt = issuedAt + validityMinutes × 60 000 ms`.
  - `static rehydrate(props)` is for repositories.
  - `isExpiredAt(now: Date): boolean` returns `expiresAt.getTime() <= now.getTime()` (FR-009 "strictly before", FR-020).
- [X] T006 Create the `Booking` entity and `type BookingStatus = 'pending_assignment'` in `src/domain/bookings/booking.ts` (depends on T005).
  - `static fromQuote(id, quote, createdAt)` copies `clientId`, `quote.id → quoteId`, `match`, `pricing` and `quote.issuedAt → quoteIssuedAt`, and sets `status = 'pending_assignment'` (FR-013, FR-014).
  - It exposes `zoneId` and `startsAt` getters (from `match`) used by the unique index.
  - `static rehydrate(props)` is for repositories.
- [X] T007 [P] Add `export const QUOTE_VALIDITY_MINUTES = 3;` with a one-line comment referencing FR-002 in `src/application/features/goalkeeperRequests/common/bookingLimits.ts` (research.md §6)
- [X] T008 Extend `src/application/features/goalkeeperRequests/common/ports.ts` exactly as `data-model.md` § Application ports specifies (depends on T005, T006):
  - `IQuoteRepository { add; findByIdForClient }`
  - `IBookingRepository { findByQuoteForClient; findByMatchForClient }`
  - the `ClaimResult` union (`booked | not_claimed | already_booked | duplicate_booking`)
  - `IQuoteConfirmationStore { claimAndBook(quoteId, clientId, now, newBooking: (quote: Quote) => Booking): Promise<ClaimResult> }`
  - `type BookingConfirmationOutcome = 'created' | 'replayed' | 'quote_not_found' | 'quote_expired' | 'duplicate_booking' | 'confirmation_in_progress'`
  - `IBookingAuditLogger { logBookingConfirmation(entry: { outcome: BookingConfirmationOutcome; clientId: string; quoteId: string; bookingId?: string }): void }`

  Existing members are unchanged. No MongoDB type appears in this file.

### Domain tests

- [X] T009 [P] Write `tests/unit/domain/bookings/pricingSnapshot.test.ts` and `tests/unit/domain/bookings/matchDetails.test.ts`.
  - `PricingSnapshot`: accepts the 007 worked example (55 000 × 2 + 5 000 × 2 = 120 000 COP); rejects each broken identity, a non-integer, a negative amount and a lower-case currency.
  - `MatchDetails`: rejects out-of-range coordinates and an invalid `Date`.
- [X] T010 [P] Write `tests/unit/domain/bookings/quote.test.ts` and `tests/unit/domain/bookings/booking.test.ts`.
  - `Quote.issue` with validity 3 gives `expiresAt` exactly 180 000 ms after `issuedAt`. `isExpiredAt` is `false` at `expiresAt − 1 ms` and `true` at `expiresAt` (SC-004).
  - `Booking.fromQuote` copies match and pricing by value, carries `quoteId`/`quoteIssuedAt`, and has status `pending_assignment`.

### Infrastructure: repositories

- [X] T011 Add `findOneAndDelete: Mock` to the `FakeMongoCollection` interface and `createFakeCollection()` in `tests/fakes/fakeMongoCollection.ts`. The other members are unchanged
- [X] T012 [P] Create `QuoteRepository implements IQuoteRepository` (collection `quotes`) in `src/infrastructure/persistence/mongo/quoteRepository.ts`.
  - `ensureIndexes()` creates `{ expiresAt: 1 }` with `{ name: 'expiresAt_ttl', expireAfterSeconds: 0 }` (research.md §4).
  - `add(quote)` calls `insertOne(toDocument)`. `findByIdForClient(quoteId, clientId)` calls `findOne({ _id: quoteId, clientId })`.
  - Export `quoteToDocument`/`quoteFromDocument`, which the transactional store (T031) reuses. Document shape per `data-model.md` § Quote: `_id`, `clientId`, `status`, `match { … startsAt: Date }`, `pricing { … }`, `issuedAt: Date`, `expiresAt: Date`.
  - `issuedAt`, `expiresAt` and `match.startsAt` MUST be written as JS `Date` objects, never ISO strings: the TTL index ignores non-Date values.
- [X] T013 [P] Create `BookingRepository implements IBookingRepository` (collection `bookings`) in `src/infrastructure/persistence/mongo/bookingRepository.ts`.
  - `ensureIndexes()` creates `{ quoteId: 1 }` as `{ name: 'quoteId_unique', unique: true }` and `{ clientId: 1, zoneId: 1, startsAt: 1 }` as `{ name: 'client_zone_start_unique', unique: true }` (research.md §2).
  - `findByQuoteForClient` calls `findOne({ quoteId, clientId })`. `findByMatchForClient` calls `findOne({ clientId, zoneId, startsAt })`.
  - Export `bookingToDocument`/`bookingFromDocument`. The document has top-level `zoneId` and `startsAt: Date` besides `match`/`pricing`, per `data-model.md` § Booking.
- [X] T014 [P] Write `tests/unit/infrastructure/persistence/mongo/quoteRepository.test.ts` against `createFakeCollection()` (depends on T011, T012).
  - The TTL index definition is exactly `({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 })`.
  - `add` writes `issuedAt`/`expiresAt`/`match.startsAt` as `Date` instances.
  - `findByIdForClient` filters on both `_id` and `clientId`, and maps a document back to an equal `Quote`.
  - It returns `null` when `findOne` resolves `null`.
- [X] T015 [P] Write `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts` against `createFakeCollection()` (depends on T011, T013).
  - Both unique index definitions (names, keys, `unique: true`).
  - Document mapping round-trip, including the top-level `zoneId`/`startsAt`.
  - Each finder's exact filter.

### Test fakes and fixtures

- [X] T016 [P] Create the in-memory fakes, backed by a `Map`, with public inspection helpers (`all()`, `seed(entity)`) like the existing fakes (depends on T008):
  - `FakeQuoteRepository implements IQuoteRepository` in `tests/fakes/fakeQuoteRepository.ts`. It supports `failNextAdd(error)` to simulate a storage failure (FR-005).
  - `FakeBookingRepository implements IBookingRepository` in `tests/fakes/fakeBookingRepository.ts`.
- [X] T017 [P] Create `FakeBookingAuditLogger implements IBookingAuditLogger`, recording every entry in a public `entries` array, in `tests/fakes/fakeBookingAuditLogger.ts` (depends on T008)
- [X] T018 Add a `buildStoredQuote(overrides?)` helper to `tests/fixtures/quoteFixtures.ts` (depends on T005). It returns a `Quote` built from the existing 007 "quote world" (a zone with a rate, `America/Bogota`, 2 goalkeepers × 90 min = 120 000 COP), with overridable `id`, `clientId`, `issuedAt`, `zoneId`, `startsAt`, so handler and HTTP tests share one canonical stored quote
- [X] T019 Wire the two repositories in `src/infrastructure/di.ts` (depends on T012, T013): construct `QuoteRepository(db)` and `BookingRepository(db)` next to `BookingSettingsRepository`, and `await ensureIndexes()` on both before the handlers are registered. No handler uses them yet

**Checkpoint**: Domain types, ports, repositories, indexes and fakes exist. `npm test && npm run lint` pass; no route behaves differently.

---

## Phase 3: User Story 3 - Every quote is recorded and can be confirmed within its validity window (Priority: P2)

**Goal**: `POST /quote` stores every successful quote (pending, expires 3 minutes after issuance) and returns `quoteId` + `expiresAt` on top of the unchanged 007 breakdown. Refusals store nothing.

**Independent Test**: Request a quote. The response has every 007 field unchanged plus `quoteId` and `expiresAt = issuedAt + 3 min`. Exactly one pending quote with the caller's id, the match details and the same amounts is stored. A refused quote stores nothing.

### Implementation for User Story 3

- [X] T020 [US3] Extend the success variant of `GetServiceQuoteResult` to `{ outcome: 'success'; quote: ServiceQuote; area: { zoneId: string; cityId: string } }` in `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.ts` (research.md §5). `ServiceQuote` itself is unchanged
- [X] T021 [US3] Return `area: { zoneId: zone.id, cityId: city.id }` alongside `quote` in the success branch of `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.ts` (depends on T020). No other line of the evaluation changes, and the handler stays read-only
- [X] T022 [P] [US3] Add assertions that the success result carries the expected `area.zoneId`/`area.cityId` (zone rate case and city-fallback case) in `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts` (depends on T021)
- [X] T023 [US3] Define `IssueServiceQuoteCommand extends ICommand<IssueServiceQuoteResult>` in `src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommand.ts` (depends on T020).
  - It carries `clientId: string` and `input: ServiceQuoteInput`.
  - `IssueServiceQuoteResult` = `{ outcome: 'success'; quote: ServiceQuote & { quoteId: string; expiresAt: string } }` | every non-success variant of `GetServiceQuoteResult`, re-used via `Exclude<GetServiceQuoteResult, { outcome: 'success' }>`.
- [X] T024 [US3] Implement `IssueServiceQuoteCommandHandler(sender: ISender, quoteRepository: IQuoteRepository, idGenerator: IIdGenerator, clock: IClock)` in `src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommandHandler.ts` (research.md §5; depends on T005, T007, T008, T023).
  - `issuedAt = clock.now()`.
  - `result = await sender.send(new GetServiceQuoteQuery(command.input))`. A non-success result is returned as is, with no write (FR-004).
  - On success, build `MatchDetails` (coordinates, durations and count from `command.input`; `zoneId`/`cityId` from `result.area`; `startsAt: new Date(quote.startsAt)`, `startsAtLocal`, `timeZone` from `result.quote`) and `PricingSnapshot` (from `result.quote`).
  - Then `Quote.issue(idGenerator.newId(), command.clientId, match, pricing, issuedAt, QUOTE_VALIDITY_MINUTES)` and `await quoteRepository.add(quote)`. Don't catch: a storage failure propagates so no price is returned (FR-005).
  - Return `{ outcome: 'success', quote: { ...result.quote, quoteId: quote.id, expiresAt: quote.expiresAt.toISOString() } }`.
  - Follow the `SaveDocumentPhotoCommandHandler` precedent for dispatching through `ISender`.
- [X] T025 [P] [US3] Write `tests/unit/application/features/goalkeeperRequests/issueServiceQuoteCommandHandler.test.ts`, using `FakeSender` (`tests/fakes/fakeSender.ts`), `FakeQuoteRepository`, a deterministic id generator and `FixedClock` (depends on T016, T024):
  - Success stores exactly one quote with status `pending`, the caller's `clientId`, the area ids, `match.startsAt` equal to the quoted instant, pricing equal to the breakdown, and `expiresAt = now + 180 s`.
  - The returned `quoteId`/`expiresAt` match the stored quote, and every 007 field is passed through unchanged (FR-003).
  - Each refusal outcome (at least `location_not_covered`, `insufficient_notice`, `rate_not_configured`) is returned unchanged and stores nothing (US3-2).
  - Two calls with the same input store two distinct quotes (US3-3).
  - With `failNextAdd(new Error('db down'))`, the handler rejects and returns no result (FR-005).
- [X] T026 [US3] Change `POST /quote` in `src/controllers/goalkeeperRequestsController.ts` (depends on T023) to send `new IssueServiceQuoteCommand(req.authClaims!.sub, { …same input as today… })` instead of `GetServiceQuoteQuery`. Respond `200` with `result.quote`, which now includes `quoteId` and `expiresAt`. Keep every refusal case of the exhaustive `switch` exactly as it is today
- [X] T027 [US3] Register `{ requestType: IssueServiceQuoteCommand, handler: new IssueServiceQuoteCommandHandler(mediator, quoteRepository, idGenerator, clock) }` in `src/infrastructure/di.ts`, keeping the existing `GetServiceQuoteQuery` registration because the command dispatches it (depends on T019, T024)
- [X] T028 [US3] In `tests/http/testAppFactory.ts`, create a `FakeQuoteRepository`, expose it on the returned test app object as `quotes`, and register `IssueServiceQuoteCommandHandler` with the factory's mediator, id generator and `FixedClock` (depends on T016, T024)
- [X] T029 [US3] Update `tests/http/controllers/goalkeeperRequestsQuote.test.ts` (depends on T026, T028).
  - The existing `200` test also asserts that `quoteId` is a string, that `expiresAt` equals the fixed clock + 3 min, and that every 007 field keeps its exact value.
  - `app.quotes.all()` holds one quote for the token's `sub`.
  - Add one assertion to an existing refusal test (e.g. `location_not_covered`) that `app.quotes.all()` is empty.
- [X] T030 [P] [US3] Document the two new `200` response properties (`quoteId`, `expiresAt` as `date-time`) of `POST /api/goalkeeper-requests/quote` in `src/infrastructure/openapi/openapiSpec.ts`, and replace its "read-only" wording with "stores the quote for 3 minutes", per `contracts/quote-service.md`

**Checkpoint**: Quotes are stored and identifiable; the app can already show the countdown. `npm test && npm run test:http` pass.

---

## Phase 4: User Story 1 - Confirm a booking from a quote at exactly the quoted price (Priority: P1) 🎯 MVP

**Goal**: `POST /api/goalkeeper-requests/bookings` with `{ quoteId }` turns the caller's valid quote into a booking whose match and price are exact copies of the quote. The quote is deleted in the same transaction.

**Independent Test**: Issue a quote (or seed one), confirm it by id, and get `201`. The booking's match and every amount equal the quote's, `status` is `pending_assignment`, the booking carries the `quoteId`, and the quote no longer exists. A later rate change doesn't affect the booked price.

### Implementation for User Story 1

- [X] T031 [US1] Add `startSession(): ClientSession` (delegating to the private `MongoClient`) to `src/infrastructure/persistence/mongo/mongoConnectionProvider.ts`. The client stays private, and no other member changes
- [X] T032 [US1] Create `MongoQuoteConfirmationStore implements IQuoteConfirmationStore` in `src/infrastructure/persistence/mongo/quoteConfirmationStore.ts` (research.md §1–§2; depends on T008, T012, T013, T031).
  - Constructor `(startSession: () => ClientSession, db: Db)`.
  - `claimAndBook` opens a session and runs `session.withTransaction(async () => { … }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' })`. Inside the callback:
    1. `db.collection('quotes').findOneAndDelete({ _id: quoteId, clientId, expiresAt: { $gt: now } }, { session })`. If it returns `null`, return `{ kind: 'not_claimed' }`.
    2. Otherwise build `newBooking(quoteFromDocument(doc))` and `insertOne(bookingToDocument(booking), { session })` on `bookings`, then return `{ kind: 'booked', booking }`.
  - Return the callback's value.
  - Wrap everything in `try/catch/finally`. `finally` always calls `session.endSession()`.
  - On an error with `code === 11000`, inspect `keyPattern`: `quoteId` → `{ kind: 'already_booked' }`; `clientId`/`zoneId`/`startsAt` → `{ kind: 'duplicate_booking', zoneId, startsAt }`, taken from the booking being inserted. Any other error rethrows (→ 500).
  - Add a doc comment noting the driver retries `TransientTransactionError` (write conflicts from concurrent confirmations) by itself.
- [X] T033 [P] [US1] Write `tests/unit/infrastructure/persistence/mongo/quoteConfirmationStore.test.ts` (depends on T011, T032).
  - Use two `createFakeCollection()`s behind a fake `db.collection(name)`, plus a fake session `{ withTransaction: vi.fn(async (fn) => fn()), endSession: vi.fn() }`.
  - The exact claim filter includes `clientId` and `expiresAt: { $gt: now }`, and both operations receive `{ session }`.
  - `null` from `findOneAndDelete` gives `not_claimed`, and `insertOne` is not called.
  - Success gives `booked`, with the inserted document equal to `bookingToDocument(Booking.fromQuote(…))`.
  - An `11000` error with `keyPattern { quoteId: 1 }` gives `already_booked`. One with `keyPattern { clientId: 1, zoneId: 1, startsAt: 1 }` gives `duplicate_booking`. Any other error rethrows.
  - `endSession` is called in every case, including a throw.
  - The transaction options include majority write concern.
- [X] T034 [P] [US1] Create `FakeQuoteConfirmationStore implements IQuoteConfirmationStore` over a `FakeQuoteRepository` and `FakeBookingRepository` in `tests/fakes/fakeQuoteConfirmationStore.ts` (depends on T016).
  - It applies the same rules in memory: claim only when the quote exists, has this `clientId` and `expiresAt > now`.
  - Before deleting the quote it checks the two uniqueness rules against the booking fake, returning `already_booked` / `duplicate_booking` and leaving the quote in place (FR-021).
  - Otherwise it deletes the quote and adds the booking.
  - `failNextWith(result: ClaimResult)` forces an outcome, to simulate concurrent winners in handler tests.
- [X] T035 [P] [US1] Create `toBookingResponse(booking: Booking)` in `src/application/features/goalkeeperRequests/common/bookingResponse.ts` (depends on T006). It returns the flat DTO of `contracts/create-booking.md` § Success: `bookingId`, `quoteId`, `status`, `latitude`, `longitude`, `zoneId`, `cityId`, `startsAt` (ISO `…Z`), `startsAtLocal`, `timeZone`, `goalkeeperCount`, `durationMinutes`, `unitRate`, `subtotal`, `unitSurcharge`, `surcharge`, `total`, `currency`, `createdAt` (ISO)
- [X] T036 [US1] Define `ConfirmBookingCommand extends ICommand<ConfirmBookingResult>` (carries `clientId`, `quoteId`) in `src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.ts`, with the **complete** result union (depends on T035):
  - `{ outcome: 'created'; booking: BookingResponse }`
  - `{ outcome: 'replayed'; booking: BookingResponse }`
  - `{ outcome: 'quote_not_found' }`
  - `{ outcome: 'quote_expired' }`
  - `{ outcome: 'duplicate_booking'; existingBookingId: string | null }`
  - `{ outcome: 'confirmation_in_progress' }`
- [X] T037 [US1] Implement the success path of `ConfirmBookingCommandHandler(bookingRepository: IBookingRepository, quoteRepository: IQuoteRepository, store: IQuoteConfirmationStore, idGenerator: IIdGenerator, clock: IClock, audit: IBookingAuditLogger)` in `src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.ts` (depends on T008, T036).
  - `now = clock.now()` is read once.
  - If `quoteId` isn't a UUID, reject it with `uuid`'s `validate`, already a dependency. This step's outcome is finalized in US4 (T047). For now, return `quote_not_found`.
  - `result = await store.claimAndBook(quoteId, clientId, now, (quote) => Booking.fromQuote(idGenerator.newId(), quote, now))`.
  - On `booked`, return `{ outcome: 'created', booking: toBookingResponse(result.booking) }`.
  - Every other `ClaimResult` temporarily returns `{ outcome: 'quote_not_found' }` with a `// refined in US2/US4` comment.
  - Call `audit.logBookingConfirmation({ outcome, clientId, quoteId, bookingId? })` exactly once before every return, through a small private `finish(result)` helper (FR-024).
- [X] T038 [P] [US1] Write the US1 cases in `tests/unit/application/features/goalkeeperRequests/confirmBookingCommandHandler.test.ts`, with `FakeQuoteRepository`, `FakeBookingRepository`, `FakeQuoteConfirmationStore`, `FakeBookingAuditLogger`, a deterministic id generator and `FixedClock`, seeding `buildStoredQuote()` (depends on T017, T018, T034, T037):
  - Confirming 1 minute after issuance gives `created`. The booking's match and every amount equal the quote's (total 120 000 COP, 2 goalkeepers, 90 min), `status` is `pending_assignment` and `quoteId` is set. The quote is gone from the fake, and exactly one booking exists (US1-1, SC-002).
  - Changing the fixture's rate data after issuing has no effect on the booked amounts, because the handler reads no rate or settings port (US1-2).
  - The audit has exactly one entry `{ outcome: 'created', bookingId }`.
- [X] T039 [P] [US1] Create `confirmBookingRequestSchema = z.object({ quoteId: z.string() })` in `src/controllers/requests/goalkeeperRequests/confirmBookingRequest.ts`. Unknown keys are stripped (FR-007). A missing or non-string `quoteId` fails validation (→ 400). The UUID format is deliberately **not** checked here, because a malformed id must be `404` (contracts/create-booking.md)
- [X] T040 [US1] Add `POST /bookings` to `src/controllers/goalkeeperRequestsController.ts`, behind the router's existing `requireAuth + requireClientOnly + requireCompleteProfile` chain (depends on T036, T039).
  - Parse `req.body ?? {}` with `confirmBookingRequestSchema`. On failure, throw `ApiError(400, 'validation_failed', …, zodFieldErrors(...))`.
  - Send `new ConfirmBookingCommand(req.authClaims!.sub, parsed.data.quoteId)`.
  - Exhaustive `switch` per `contracts/create-booking.md` § Errors:

    | Outcome | Response |
    |---|---|
    | `created` | `201` + `result.booking` |
    | `replayed` | `200` + `result.booking` |
    | `quote_not_found` | `ApiError(404, 'quote_not_found', …)` |
    | `quote_expired` | `ApiError(410, 'quote_expired', …)` |
    | `duplicate_booking` | `ApiError(409, 'duplicate_booking', …, undefined, { bookingId: result.existingBookingId })` |
    | `confirmation_in_progress` | `res.set('Retry-After', '1')`, then `ApiError(409, 'confirmation_in_progress', …)` |

  - Update the controller's doc comment: it's no longer read-only.
- [X] T041 [P] [US1] Make `PinoAuditLogger` also implement `IBookingAuditLogger` in `src/infrastructure/observability/pinoAuditLogger.ts` (research.md §8; depends on T008). `logBookingConfirmation(entry)` logs `{ audit: 'booking_confirmation', ...entry }`: `logger.info` for `created`/`replayed`, `logger.warn` for every refusal
- [X] T042 [US1] Wire it in `src/infrastructure/di.ts` (depends on T027, T032, T037, T041).
  - `const quoteConfirmationStore = new MongoQuoteConfirmationStore(() => connectionProvider.startSession(), db)`, using whatever variable name `di.ts` already has for the `MongoConnectionProvider`.
  - Register `{ requestType: ConfirmBookingCommand, handler: new ConfirmBookingCommandHandler(bookingRepository, quoteRepository, quoteConfirmationStore, idGenerator, clock, auditLogger) }`.
- [X] T043 [US1] In `tests/http/testAppFactory.ts`, create a `FakeBookingRepository` (exposed as `bookings`), a `FakeQuoteConfirmationStore` over the `quotes`/`bookings` fakes and a `FakeBookingAuditLogger`, and register `ConfirmBookingCommandHandler` (depends on T028, T034, T037)
- [X] T044 [US1] Create `tests/http/controllers/goalkeeperRequestsBookings.test.ts` with the US1 cases (depends on T040, T043):
  - `POST /quote`, then `POST /bookings` with the returned `quoteId`, gives `201`. The body matches `contracts/create-booking.md` field for field, with amounts equal to the quote's and `status: 'pending_assignment'`. `app.quotes.all()` is empty and `app.bookings.all()` has one entry.
  - A body with extra `total: 1` / `goalkeeperCount: 1` fields still books the quote's values (US1-3).
  - No token gives `401`. A goalkeeper token or an incomplete profile gives `403`.
- [X] T045 [P] [US1] Document `POST /api/goalkeeper-requests/bookings` (request body, `201`/`200` response schema, the `400`/`404`/`409`/`410` errors, `Retry-After` on `409 confirmation_in_progress`, bearer auth) in `src/infrastructure/openapi/openapiSpec.ts`, per `contracts/create-booking.md`

**Checkpoint**: MVP. A client can book a quote at the quoted price, atomically. `npm test && npm run test:http && npm run lint` pass.

---

## Phase 5: User Story 2 - Double taps and network retries never create a second booking (Priority: P1)

**Goal**: Every repeated confirmation of the same quote by its client returns the same booking (`200`), including long after expiry. A concurrent confirmation that hasn't committed yet gets a retryable `409 confirmation_in_progress`, never a second booking.

**Independent Test**: Confirm the same quote repeatedly (sequentially, and with the store forced to report a concurrent winner). Exactly one booking exists, and every successful response names it.

### Implementation for User Story 2

- [X] T046 [US2] Add the replay and in-progress branches to `src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.ts` (research.md §3 steps 1 and 3; depends on T037):
  - (a) Right after the UUID check and **before** the store call, `existing = await bookingRepository.findByQuoteForClient(quoteId, clientId)`. If found, return `{ outcome: 'replayed', booking }` without opening a transaction (FR-015).
  - (b) When the store returns `not_claimed` or `already_booked`, look the booking up again with `findByQuoteForClient`. If it's found, return `replayed` (FR-017).
  - (c) Otherwise, `quote = await quoteRepository.findByIdForClient(quoteId, clientId)`. If the quote exists and `!quote.isExpiredAt(now)`, return `{ outcome: 'confirmation_in_progress' }` (FR-016).
  - Leave the remaining fall-through as `quote_not_found` for US4.
- [X] T047 [P] [US2] Add the US2 cases to `tests/unit/application/features/goalkeeperRequests/confirmBookingCommandHandler.test.ts` (depends on T046):
  - Confirm, then confirm again. The second call gives `replayed` with the same `bookingId`, the store isn't called the second time (spy or counter on the fake), and there is still one booking (US2-1, FR-017).
  - Confirm, advance the clock 2 days, confirm again. That gives `replayed`, not expired or not-found (US2-3, SC-003).
  - The store is forced to `already_booked` after another booking for the same `quoteId` was seeded in the booking fake (the concurrent winner committed), giving `replayed` with that booking (US2-2).
  - The store is forced to `not_claimed` while the quote is still present and unexpired, giving `confirmation_in_progress` with no booking created.
  - The audit records `replayed` / `confirmation_in_progress` respectively.
- [X] T048 [US2] Add the US2 cases to `tests/http/controllers/goalkeeperRequestsBookings.test.ts` (depends on T044, T046):
  - Confirming the same `quoteId` twice gives `201` then `200` with identical bodies.
  - Firing two confirmations with `Promise.all` gives one `201` and one `200`, both with the same `bookingId`, and `app.bookings.all()` has length 1. Against the fake this is sequential; true concurrency is checked manually in T054.
  - With the store forced to `not_claimed` and the quote seeded unexpired, the response is `409` with `error: 'confirmation_in_progress'` and the header `Retry-After: 1`.

**Checkpoint**: Retries are safe. `npm test && npm run test:http` pass.

---

## Phase 6: User Story 4 - Stale, foreign or unknown quotes are refused clearly (Priority: P2)

**Goal**: Expired, unknown, malformed and other clients' quotes, and confirmations that would duplicate an existing booking for the same zone and start, are refused with distinct reasons. Nothing is booked and no quote is changed.

**Independent Test**: Confirm an expired quote (`410`), an unknown id (`404`), a malformed id (`404`), another client's quote (`404`, indistinguishable) and a second quote for an already-booked zone and start (`409 duplicate_booking` with the existing `bookingId`). In each case, no booking is created and the quote fakes are unchanged.

### Implementation for User Story 4

- [X] T049 [US4] Complete the classification in `src/application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommandHandler.ts` (research.md §3; depends on T046):
  - (a) The malformed-UUID check returns `quote_not_found` **before any repository call** (FR-018a). Confirm it's the first statement after reading `now`.
  - (b) In the post-claim branch, when the quote exists and `quote.isExpiredAt(now)`, return `{ outcome: 'quote_expired' }` without modifying or deleting it (FR-019).
  - (c) When neither booking nor quote exists, return `quote_not_found`. Because every lookup filters by `clientId`, another client's quote falls here (FR-018a).
  - (d) Map the store's `duplicate_booking` result to `{ outcome: 'duplicate_booking', existingBookingId: (await bookingRepository.findByMatchForClient(clientId, result.zoneId, result.startsAt))?.id ?? null }` (FR-022).
  - Remove the temporary `// refined in US2/US4` fall-through, so every `ClaimResult` kind is handled explicitly: add a `never` check in the `switch`.
- [X] T050 [P] [US4] Add the US4 cases to `tests/unit/application/features/goalkeeperRequests/confirmBookingCommandHandler.test.ts` (depends on T049):
  - A quote issued 4 minutes ago and still present gives `quote_expired`. The quote is still in the fake, unchanged, and there's no booking (US4-1, FR-019, FR-021).
  - SC-004 boundary: `expiresAt − 1 s` gives `created`; exactly `expiresAt` gives `quote_expired` (US4-4).
  - The quote is absent (removed by TTL) gives `quote_not_found`.
  - Client B confirming client A's quote gives `quote_not_found`. A's quote is untouched and there's no booking (US4-2).
  - `'not-a-uuid'` gives `quote_not_found`, and no repository or store method is called (US4-3).
  - Sequential SC-008: client A books quote Q1 for zone Z at 15:00, then confirms Q2 for zone Z at 15:00. That gives `duplicate_booking` with `existingBookingId` equal to Q1's booking id; Q2 is still stored and there's still one booking (US4-5, FR-021).
  - The same client with a different zone or a different start is **not** a duplicate (both are `created`).
  - Every refusal writes exactly one audit entry with its outcome and no `bookingId`.
- [X] T051 [US4] Add the US4 cases to `tests/http/controllers/goalkeeperRequestsBookings.test.ts` (depends on T048, T049). Each asserts the `ApiError` body shape `{ error, message }` and that `app.bookings.all()` is unchanged:
  - Missing `quoteId`, or `quoteId: 123`, gives `400 validation_failed` with `fieldErrors.quoteId`.
  - An unknown UUID gives `404 quote_not_found`. `'abc'` gives `404 quote_not_found`.
  - Another user's token gives `404 quote_not_found`.
  - Advancing the fixed clock past `expiresAt` gives `410 quote_expired`.
  - A second quote for the same zone and start gives `409 duplicate_booking`, with `bookingId` equal to the first booking's id.

**Checkpoint**: All four stories work independently. `npm test && npm run test:http && npm run test:architecture && npm run lint` pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, the full suite, and a manual check of the guarantees that only the real database can prove.

- [X] T052 [P] Add a short "Superseded by 008" note at the top of `specs/007-goalkeeper-service-quote/contracts/quote-service.md`, pointing to `specs/008-quote-to-booking/contracts/quote-service.md` (the endpoint is no longer read-only and returns `quoteId`/`expiresAt`)
- [X] T053 Run the full suite and fix anything it surfaces: `npm run test:all && npm run lint && npm run build`. Includes the architecture test: no `mongodb` import under `src/domain` or `src/application`
- [ ] T054 **Manual, against the Atlas dev cluster**: run `specs/008-quote-to-booking/quickstart.md` §1 (verify the three indexes exist after startup), §3 (happy path, replay, and expiry: `410`, then `404` after the TTL monitor runs; SC-009) and §4:
  - SC-001: 100 parallel confirmations of one quote give exactly one booking.
  - SC-008: 5 parallel quotes for the same match give one `201` and four `409 duplicate_booking`.
  - SC-005: temporary `throw` after `insertOne` gives `500`, the quote still exists and there is no booking. Revert the throw.

  Record the observed status-code counts in a short "Verification" section appended to `specs/008-quote-to-booking/quickstart.md`
- [X] T055 [P] Update the "Recent Changes"/storage lines in `CLAUDE.md` only if the implementation diverged from the plan (e.g. a different endpoint path or collection name). Otherwise leave it as `/speckit.plan` wrote it

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories.**
- **US3 (Phase 3)**: depends on Foundational. It produces the stored quotes and the `quotes` fake that the HTTP tests of US1/US2/US4 obtain through `POST /quote`.
- **US1 (Phase 4)**: depends on Foundational. The handler and unit tests only need seeded quotes (`buildStoredQuote`), so they can start in parallel with US3. The HTTP test T044 and the DI wiring T042 depend on US3 (T027, T028).
- **US2 (Phase 5)**: depends on US1 (it extends the same handler: T046 after T037).
- **US4 (Phase 6)**: depends on US2 (T049 after T046, same handler file).
- **Polish (Phase 7)**: depends on all stories.

### User Story Dependencies

```text
Setup → Foundational ─┬─→ US3 (quote recording) ─────────────┐
                      └─→ US1 handler/store/unit tests ──────┴─→ US1 HTTP + DI (MVP) → US2 → US4 → Polish
```

### Within Each User Story

- Types and ports before handlers, handlers before controllers, and controllers before HTTP tests.
- The handler file `confirmBookingCommandHandler.ts` is edited sequentially: T037 (US1), then T046 (US2), then T049 (US4). Its unit-test file grows in the same order (T038 → T047 → T050).
- `src/infrastructure/di.ts` is edited sequentially: T019, then T027, then T042.
- `tests/http/testAppFactory.ts` is edited sequentially: T028, then T043.
- `src/controllers/goalkeeperRequestsController.ts` is edited sequentially: T026, then T040.
- `src/infrastructure/openapi/openapiSpec.ts` is edited sequentially: T030, then T045.

### Parallel Opportunities

- **Phase 2**: T003, T004 and T007 together. Then T005 → T006 → T008. Then T009, T010, T012, T013, T016 and T017 in parallel. T014 and T015 after T011.
- **US3**: T022, T025 and T030 in parallel once their implementation task is done.
- **US1**: T033, T034, T035, T039 and T041 are all in different files and can run in parallel after T032/T008. T038 and T045 run in parallel with the controller work.
- **US3 and US1** can be worked on by two people at once until T042/T043 (see the graph above).

---

## Parallel Example: User Story 1

```bash
# After T032 (store) and T008 (ports) are done, in parallel:
Task: "T033 [US1] quoteConfirmationStore.test.ts: filter, session, 11000 classification, endSession"
Task: "T034 [US1] FakeQuoteConfirmationStore in tests/fakes/fakeQuoteConfirmationStore.ts"
Task: "T035 [US1] toBookingResponse in src/application/features/goalkeeperRequests/common/bookingResponse.ts"
Task: "T039 [US1] confirmBookingRequestSchema in src/controllers/requests/goalkeeperRequests/confirmBookingRequest.ts"
Task: "T041 [US1] PinoAuditLogger implements IBookingAuditLogger"
```

## Parallel Example: Foundational

```bash
Task: "T003 MatchDetails in src/domain/bookings/matchDetails.ts"
Task: "T004 PricingSnapshot in src/domain/bookings/pricingSnapshot.ts"
Task: "T007 QUOTE_VALIDITY_MINUTES in bookingLimits.ts"
# then, after T005/T006/T008:
Task: "T012 QuoteRepository (TTL index)"
Task: "T013 BookingRepository (unique indexes)"
Task: "T016 FakeQuoteRepository + FakeBookingRepository"
Task: "T017 FakeBookingAuditLogger"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup, then Phase 2 Foundational.
2. Phase 3 (US3): quotes are stored and return `quoteId`/`expiresAt`. This can ship alone: older apps are unaffected, and new apps can show the countdown.
3. Phase 4 (US1): confirmation creates the booking atomically. **Stop and validate**: run quickstart §3 against the dev cluster.
4. Don't release confirmation to the app without Phase 5 (US2). A double tap would then return `404` for the second tap instead of the booking. No duplicate is created, but the app would show a misleading error.

### Incremental Delivery

1. US3: deployable on its own (additive response fields).
2. US1 + US2: release together, since both are P1 and the spec requires safe retries before release.
3. US4: refines the refusal reasons (`410` and `409 duplicate_booking` instead of the interim `404`). The duplicate *prevention* itself is already enforced from US1 by the unique index; US4 only adds the correct reason and the existing `bookingId`.
4. Polish: run the manual database verification (T054) before exposing the endpoint in the production app.

---

## Notes

- [P] tasks are different files with no unmet dependency.
- Every task names its exact file. Tasks that edit a shared file (`confirmBookingCommandHandler.ts`, `di.ts`, `testAppFactory.ts`, the controller, `openapiSpec.ts`) are deliberately not [P] with each other.
- Keep MongoDB types out of `src/domain` and `src/application` (the architecture test enforces this).
- Commit after each phase checkpoint.
