---

description: "Task list for Goalkeepers See Available Matches and Accept One"
---

# Tasks: Goalkeepers See Available Matches and Accept One

**Input**: Design documents from `/specs/012-accept-goalkeeper-booking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/goalkeeper-bookings.md, quickstart.md

**Tests**: Included, per the repository convention:
- hand-written fakes plus `FixedClock`;
- stores and repositories tested against `tests/fakes/fakeMongoCollection.ts` plus a mocked `withTransaction`;
- HTTP tests with **`await buildTestApp()`** and the helpers in `tests/http/walletTestHelpers.ts` (`signInGoalkeeper`, `signInAdmin`, `ownerOf`);
- no real database; real concurrency is a manual check.

**Organization**:
- Phase 2 extends the shapes along the whole chain (quote → request → booking) with the fixed commission, the travel margin, `endsAt` and `searchEndsAt`. It adds the settings, profile and user reads and the pure `schedulePolicy`, and it ends **green** with existing tests updated.
- The story phases then add the new endpoints and behaviors.
- US3 and US4 are mostly test slices over the acceptance built in US2, plus the in-transaction checks they prove.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US6 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 Add `TRAVEL_BUFFER_MINUTES_DEFAULT = 30` and `AVAILABLE_CANDIDATES_CAP = 1000` (with doc comments citing FR-010 and research §4) to `src/application/features/goalkeeperRequests/common/bookingLimits.ts`.

---

## Phase 2: Foundational (fixed commission and travel margin through the chain)

**⚠️ CRITICAL**: blocks every story. `tsc` may be red between T006 and T012.

### Domain

- [X] T002 [P] Create `src/domain/bookings/schedulePolicy.ts`, per data-model.md:
  - `interface Commitment { id; requestId; startsAt: Date; endsAt: Date; travelBufferMinutes: number }`;
  - `clashes(a, b)`: strict `a.startsAt < b.endsAt + m && b.startsAt < a.endsAt + m`, with `m = max(a.travelBufferMinutes, b.travelBufferMinutes)` in minutes;
  - `firstConflict(candidate, held)`, which ignores a held booking with the same id;
  - `holdsSameRequest(candidate, held)`.

  Add `tests/unit/domain/bookings/schedulePolicy.test.ts` with the spec US3 table:
  - 18:00–19:30 held with a 30-minute margin vs 19:45 → clash; vs 20:00 → no clash (touching boundary);
  - a match ending at 19:40 vs one held at 20:00 → clash;
  - different margins (30 / 45) → the max applies, symmetrically;
  - same request → `holdsSameRequest` true.
- [X] T003 [P] Extend `src/domain/pricing/bookingSettings.ts` with an optional `travelBufferMinutes` (an integer ≥ 0, else `InvalidConfigurationError`), mirroring `freeCancellationMinutes`. Map it in `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts`. Extend `resolveBookingSettings` (city ?? country ?? null, **not** added to `missing`) and `resolveAreaSettings` in `serviceArea.ts` (they return it). Extend `tests/unit/domain/pricing/bookingSettings.test.ts`, `tests/unit/infrastructure/persistence/mongo/bookingSettingsRepository.test.ts` and `tests/unit/application/features/goalkeeperRequests/resolveBookingSettings.test.ts`, updating any exact-shape (`toEqual`) assertions.
- [X] T004 [P] Add `suspendedUntil: Date | null` (optional in the constructor params, default null) to `src/domain/goalkeepers/goalkeeperProfile.ts`, with a doc comment ("read by 012, written by 018"). Map it both ways in `src/infrastructure/persistence/mongo/goalkeeperProfileRepository.ts` (absent → null). Extend `tests/unit/infrastructure/persistence/mongo/goalkeeperProfileRepository.test.ts`.
- [X] T005 [P] Add `getByIds(ids: string[]): Promise<User[]>` to `IUserRepository` in `src/application/features/auth/common/ports.ts`:
  - implement it in `src/infrastructure/persistence/mongo/userRepository.ts` (`$in`; empty → `[]` with no query) and in `tests/fakes/fakeUserRepository.ts`;
  - extend `tests/unit/infrastructure/persistence/mongo/userRepository.test.ts`.
- [X] T006 Extend the 010 domain chain:
  - `src/domain/bookings/quote.ts`: `commission: number` (an integer > 0) and `travelBufferMinutes: number` (an integer ≥ 0), as new trailing parameters of `Quote.issue` and fields of `rehydrate`;
  - `src/domain/bookings/goalkeeperRequest.ts`: both copied in `fromQuote`;
  - `src/domain/bookings/booking.ts`: `commission`, `travelBufferMinutes`, `endsAt` (= start + `durationMinutes`), `searchEndsAt` (= start − margin), `goalkeeperId: string | null`, `assignedAt: Date | null`. Also `isSearchOpenAt(now)` (`now < searchEndsAt`) and `assign(goalkeeperId, at)`, which returns an `assigned` copy and throws unless the booking is `pending_assignment`.

  `Booking.forRequest` fills the new fields from the request. Update `tests/unit/domain/bookings/quote.test.ts`, `goalkeeperRequest.test.ts` and `booking.test.ts` (new fields, `isSearchOpenAt` boundary, `assign` rules), and `buildStoredQuote` / `buildRequest` in `tests/fixtures/quoteFixtures.ts` (defaults: commission 7000, margin 30; overridable).

### Persistence and ports

- [X] T007 [P] Map the new fields in `src/infrastructure/persistence/mongo/quoteRepository.ts` and `goalkeeperRequestRepository.ts`. Add `findByIds(ids)` to `IGoalkeeperRequestRepository`, to its Mongo implementation and to `tests/fakes/fakeGoalkeeperRequestRepository.ts`. Extend their repository tests (round trip; `findByIds` `$in`).
- [X] T008 Extend `src/infrastructure/persistence/mongo/bookingRepository.ts`:
  - map the new fields;
  - `ensureIndexes()` also creates `status_zone_start` (`{ status: 1, zoneId: 1, startsAt: 1, _id: 1 }`) and `goalkeeper_start` (`{ goalkeeperId: 1, startsAt: 1, _id: 1 }`).

  Implement the new reads of data-model.md:
  - `findById`;
  - `findAvailableCandidates({ zoneIds, excludeClientId, maxCommission, now, cap })` → `{ status: 'pending_assignment', zoneId: { $in }, searchEndsAt: { $gt: now }, clientId: { $ne }, commission: { $lte } }`, sort `{ startsAt: 1, _id: 1 }`, `limit(cap)`; empty `zoneIds` → `[]`;
  - `findAssignedToGoalkeeper(goalkeeperId)` → `{ goalkeeperId, status: 'assigned' }`;
  - `countForGoalkeeper`, `findUpcomingForGoalkeeper` and `findPastForGoalkeeper`, the same shape as 009's list reads but filtered by `goalkeeperId: <id>` (any status).

  Update `src/application/features/goalkeeperRequests/common/ports.ts`. Implement the same reads in `tests/fakes/fakeBookingRepository.ts`. Extend `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts` (mapping, the 2 new indexes, every filter, sort and limit).
- [X] T009 Add to `src/application/features/goalkeeperRequests/common/ports.ts`:
  - `AcceptanceResult` and `IBookingAcceptanceStore` (data-model.md);
  - `IAcceptanceAuditLogger`.

  Implement `logAcceptance` in `src/infrastructure/observability/pinoAuditLogger.ts` (info on accepted/replayed, warn otherwise), and add `tests/fakes/fakeAcceptanceAuditLogger.ts`.

### Quote and confirmation carry the new fields

- [X] T010 In `getServiceQuoteQueryHandler.ts`:
  - resolve the commission through the wallet slice's `ICommissionResolver` (`resolveForZones([zone.id])`, injected as a new constructor dependency). Missing → `{ outcome: 'service_not_configured', cityId, missing: [...areaMissing, 'commission'] }`, with the existing 422 mapping and warning;
  - put `commission` and `travelBufferMinutes` (from `resolveAreaSettings`, nullable) in the internal `area` of the success result.

  In `issueServiceQuoteCommandHandler.ts`:
  - pass `area.commission` and `area.travelBufferMinutes ?? TRAVEL_BUFFER_MINUTES_DEFAULT` to `Quote.issue`;
  - add `travelBufferDefaulted: boolean` to the success result (not serialized);
  - the controller logs `travel_buffer_not_configured` with `cityId`, like `free_cancellation_not_configured`.

  Update `di.ts` and `tests/http/testAppFactory.ts` (the query handler gets the resolver), and the unit tests `getServiceQuoteQueryHandler.test.ts` / `issueServiceQuoteCommandHandler.test.ts`:
  - a commission is required: a missing one appears in `missing`;
  - stored values and defaults for both fields;
  - existing `toEqual` assertions updated for the extra `area` keys.

  The test world must seed a Colombia commission. Add it in `seedQuoteWorld`, or directly in the fakes the unit harness uses, so existing quote tests keep succeeding.
- [X] T011 Confirm that `ConfirmBookingCommandHandler` needs no change: `GoalkeeperRequest.fromQuote` and `Booking.forRequest` now copy the fields. Verify that `tests/unit/infrastructure/persistence/mongo/quoteConfirmationStore.test.ts` still passes with the new documents, and adjust expectations if needed.
- [X] T012 Run `npx tsc --noEmit -p .`, `npm test`, `npm run test:http` and `npm run test:architecture`. Fix every existing test broken by the new required fields (the HTTP quote/booking tests need the seeded commission; the goalkeeper-requests HTTP suite already uses the factory's commission from 011).

**Checkpoint**: green. Every booking now carries its fixed commission, margin, `endsAt` and `searchEndsAt`.

---

## Phase 3: User Story 1 - A goalkeeper sees the matches they can take (Priority: P1) 🎯 MVP

**Goal**: `GET /api/goalkeepers/me/available-bookings`.

**Independent Test**: With bookings in enabled and non-enabled zones, one past its search end, one clashing, one of the goalkeeper's own request, one of a request they already hold and one with an unaffordable commission, only the takeable ones are listed, soonest first. When the goalkeeper is suspended or can't afford their lowest zone commission, the list is empty with the reason.

- [X] T013 [P] [US1] Create `src/application/features/goalkeeperRequests/common/goalkeeperBookingResponse.ts` with:
  - `AvailableBookingItem` (contract fields: `bookingId`, `requestId`, zone and city ids and names, `startsAt`, `startsAtLocal`, `timeZone`, `durationMinutes`, `goalkeeperCount`, `earnings` = `price.total`, `commission`, `currency`);
  - `AgendaItem` (= available item + `status`, `assignedAt`, `latitude`, `longitude`, `client`);
  - builders `toAvailableItem(booking, request, names)` and `toAgendaItem(booking, request, names, clientContact)`.
- [X] T014 [US1] Create `src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.ts` and `…QueryHandler.ts`, with `(goalkeeperId, page, pageSize)` and research §4:
  1. profile (none → `not_a_goalkeeper`);
  2. suspended (`suspendedUntil > now`) → empty page with `unavailableReason: 'suspended'` and `suspendedUntil`;
  3. wallet balance (`IWalletRepository`, missing → 0) and `commissionResolver.resolveForZones(profile.zoneIds)` → `offersStatus`; `!canSeeOffers` → empty page with `unavailableReason: 'insufficient_funds'` and `missingAmount`;
  4. `findAvailableCandidates({ zoneIds: profile.zoneIds, excludeClientId: goalkeeperId, maxCommission: balance, now, cap: AVAILABLE_CANDIDATES_CAP })`, logging a warning when `candidates.length === cap`;
  5. commitments = `findAssignedToGoalkeeper(goalkeeperId)`, then drop candidates where `holdsSameRequest` or `firstConflict` is non-null;
  6. paginate in memory;
  7. load the page's requests (`findByIds`) and zone/city names (as in 009), and build `toAvailableItem`.

  Result: `{ outcome: 'success', items, page, pageSize, totalItems, totalPages, unavailableReason, missingAmount, suspendedUntil }` or `not_a_goalkeeper`.
- [X] T015 [P] [US1] Add `tests/unit/application/features/goalkeeperRequests/listAvailableBookingsQueryHandler.test.ts` covering spec US1 scenarios 1–7: zones, the search-end boundary (19:29 listed, 19:30 not), clash, affordability, suspended, insufficient funds with the missing amount, own request, same request, soonest-first order, pagination totals, and no client fields in items.
- [X] T016 [US1] Add `GET /me/available-bookings` to `src/controllers/goalkeeperController.ts`:
  - pagination through `listClientBookingsRequestSchema` + `zodFieldErrors`;
  - `not_a_goalkeeper` → the shared `goalkeeperNotFound()` from `src/controllers/wallet/walletHttp.ts`.

  Register the handler in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`.
- [X] T017 [US1] Create `tests/http/controllers/goalkeeperAvailableBookings.test.ts`:
  - a client creates a 2-goalkeeper request in `zone-cali-norte` (quote + confirm via HTTP, as in `goalkeeperRequestsBookings.test.ts`);
  - a goalkeeper (`signInGoalkeeper`, zone `zone-cali-norte`) credited through `context.walletLedger.adjust` sees 2 items with `earnings` and `commission`, and no client fields;
  - without balance → an empty list with `unavailableReason: 'insufficient_funds'`;
  - a client-only token → 404;
  - pagination 400.

---

## Phase 4: User Story 2 - Accept: assign and charge, all or nothing (Priority: P1)

**Goal**: `POST /api/goalkeepers/me/bookings/:bookingId/accept`.

**Independent Test**: With 20.000 of balance, accepting a pending booking with a 7.000 commission gives 201: the booking is assigned, 1 charge referencing the booking and request exists, and the balance is 13.000. Repeating gives 200 with no new charge. The request shows `partially_assigned`.

- [X] T018 [US2] Create `src/infrastructure/persistence/mongo/bookingAcceptanceStore.ts` with `MongoBookingAcceptanceStore implements IBookingAcceptanceStore`, exactly as research §3 and the plan's "Implementation notes" describe:
  - the conditional claim `findOneAndUpdate`;
  - the in-session read of the goalkeeper's other `assigned` bookings, then `holdsSameRequest` / `firstConflict` → throw `AcceptanceAbort`;
  - `appendMovementInSession(db, session, commissionDraft(claimedBooking), now)` → `insufficient_funds` → throw `AcceptanceAbort`;
  - return `accepted`.

  Catch `AcceptanceAbort` and convert it to its result; rethrow everything else; always `endSession()`. Add `tests/unit/infrastructure/persistence/mongo/bookingAcceptanceStore.test.ts`, with mocked `bookings` and `wallets`/`walletMovements` collections and a session:
  - the claim filter and `$set`;
  - `{ session }` on every operation;
  - `not_claimed`;
  - aborts → `same_request`, `schedule_conflict` (with id) and `insufficient_funds`, with no movement inserted;
  - a rethrow;
  - `endSession`.
- [X] T019 [P] [US2] Create `tests/fakes/fakeBookingAcceptanceStore.ts`, an in-memory store over `FakeBookingRepository` and `FakeWalletStore` that applies the same rules atomically (claim only if pending, search open and not own; check commitments; charge via the fake store; roll the claim back if anything fails). Include a `failNextWith(result | Error)` hook, as in `FakeQuoteConfirmationStore`.
- [X] T020 [US2] Create `src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.ts` and `…CommandHandler.ts`, with `(goalkeeperId, bookingId)`. The result union is:
  - `accepted` / `replayed` (with the agenda item, including the client contact);
  - the refusals of research §8 (`already_taken`, `search_ended`, `zone_not_enabled`, `insufficient_funds { missingAmount }`, `suspended { suspendedUntil }`, `schedule_conflict { conflictingBookingId }`, `own_request`, `same_request`, `not_available`, `not_a_goalkeeper`).

  Flow:
  1. malformed id (`uuid.validate`) → `not_available`;
  2. profile (none → `not_a_goalkeeper`);
  3. booking (none → `not_available`);
  4. assigned to this goalkeeper → `replayed`;
  5. suspended;
  6. zone not in `profile.zoneIds`;
  7. own request (`booking.clientId`);
  8. not pending → `already_taken` if another goalkeeper holds it, else `not_available`;
  9. search ended;
  10. wallet context (011's `resolveGoalkeeperWalletContext`) and a pre-check with `canAfford(balance, booking.commission)`;
  11. `store.accept` with `commissionDraft = booking → WalletLedger`-equivalent draft (type `commission_charge`, amount `−booking.commission`, causeKey `commission:<bookingId>`, references `{ bookingId, requestId }`, invoicing from the context);
  12. `not_claimed` → re-read and classify as in the plan.

  Audit every outcome. Build the agenda item by loading the request, the names and the client contact (`IUserRepository.getByIds`).

  To avoid duplicating the draft logic, add `commissionChargeDraft(owner, { bookingId, requestId, amount }, id, now)` to `src/application/features/wallet/common/walletLedger.ts` as an exported function, used by both `WalletLedger.chargeCommission` and this handler.
- [X] T021 [P] [US2] Add `tests/unit/application/features/goalkeeperRequests/acceptBookingCommandHandler.test.ts` covering spec US2 scenarios 1–5:
  - the balance drops by exactly the booking's commission;
  - the charge references the booking and request;
  - the booking is assigned with `assignedAt`;
  - replay → `replayed`, with no second movement;
  - `failNextWith(new Error)` → nothing assigned and nothing charged;
  - the request's derived status becomes `partially_assigned`, then `assigned`;
  - the audit entries.
- [X] T022 [US2] Add `POST /me/bookings/:bookingId/accept` to `src/controllers/goalkeeperController.ts`, with the exhaustive mapping of research §8 (201 / 200 / the errors with their extra fields). Register `AcceptBookingCommandHandler` in `di.ts` (with `MongoBookingAcceptanceStore`, `connectionProvider.startSession`, the user repository and the audit logger) and in `tests/http/testAppFactory.ts` (with `FakeBookingAcceptanceStore`).
- [X] T023 [US2] Create `tests/http/controllers/goalkeeperAcceptBooking.test.ts`:
  - 201 with the agenda-item body, including the client contact;
  - the wallet movement is visible through `/me/wallet/movements`;
  - replay → 200;
  - a second goalkeeper → `409 booking_already_taken`;
  - the client's "Mis reservas" shows `partially_assigned`.

---

## Phase 5: User Story 3 - No clashes, even concurrently (Priority: P1)

**Goal**: Prove FR-008/FR-009 on the acceptance path.

**Independent Test**: With a 30-minute margin and a match held 18:00–19:30: 19:45 → `schedule_conflict`; 20:00 → accepted. Two clashing acceptances at once → exactly one success. The other booking of a held request → `same_request`.

- [X] T024 [P] [US3] Add clash cases to `acceptBookingCommandHandler.test.ts`:
  - spec US3 scenarios 1–3 and 5, with `conflictingBookingId` and no charge on refusal;
  - scenario 4: simulate the concurrent case by making the fake store see the first assignment inside the second accept (call `accept` twice in sequence without awaiting the handler's pre-checks, or use the fake's rule directly). Assert exactly 1 assigned and 1 movement.
- [X] T025 [P] [US3] Add to `tests/http/controllers/goalkeeperAcceptBooking.test.ts`: accept a booking, then a clashing one → `409 schedule_conflict` with `conflictingBookingId`; a non-clashing one → 201.

---

## Phase 6: User Story 4 - Clear refusals that change nothing (Priority: P1)

**Goal**: Each refusal reason is distinct and records nothing.

**Independent Test**: Trigger each reason once and verify the distinct answer, no movement, and the booking unchanged.

- [X] T026 [P] [US4] Add one test per refusal to `acceptBookingCommandHandler.test.ts`:
  - `search_ended` (exactly at `searchEndsAt`);
  - `zone_not_enabled`;
  - `insufficient_funds` with `missingAmount`;
  - `suspended` with `suspendedUntil`;
  - `own_request`;
  - `not_available` (unknown id, malformed id, cancelled booking);
  - `not_a_goalkeeper`.

  After each one, assert 0 movements and the booking still `pending_assignment` (where it existed).
- [X] T027 [P] [US4] Add to `goalkeeperAcceptBooking.test.ts` the HTTP mapping of every refusal (status, `error` and extra fields) per contracts/goalkeeper-bookings.md.

---

## Phase 7: User Story 5 - Contacts after assignment (Priority: P2)

**Goal**: The client sees the goalkeeper's name and WhatsApp on assigned bookings.

**Independent Test**: After an acceptance, "Mis reservas" shows `bookings[i].goalkeeper = { firstName, lastName, whatsApp }` on the assigned booking and `null` on the other; the goalkeeper's agenda shows the client's contact.

- [X] T028 [US5] Create `src/application/features/goalkeeperRequests/common/contacts.ts`:
  - `interface Contact { firstName; lastName; whatsApp }`;
  - `toContact(user)` (whatsApp = `"<countryCallingCode> <whatsAppNumber>"`);
  - `loadContacts(userRepository, ids)` → `Map<userId, Contact>`.

  Extend `toRequestResponse` in `requestResponse.ts` with an optional `contacts` map, so each booking item gains `goalkeeper: Contact | null` and `assignedAt: string | null`. Update `ListClientRequestsQueryHandler` (one `loadContacts` per page for the assigned goalkeepers) and the replay path of `ConfirmBookingCommandHandler` (inject `IUserRepository` into both; update `di.ts` and the test factory).
- [X] T029 [P] [US5] Tests:
  - extend `listClientRequestsQueryHandler.test.ts` (an assigned booking shows the goalkeeper contact; an unassigned one `null`; one user read per page);
  - extend `goalkeeperRequestsBookingsList.test.ts` (after an HTTP acceptance, the list shows the contact; no email or document fields);
  - update exact-shape assertions in the 010 tests to include `goalkeeper: null` and `assignedAt: null`.

---

## Phase 8: User Story 6 - The goalkeeper's agenda (Priority: P2)

**Goal**: `GET /api/goalkeepers/me/bookings`.

**Independent Test**: With assigned bookings tomorrow, in 5 days and 3 days ago, the agenda shows them in that order, with the client contact; another goalkeeper's bookings never appear.

- [X] T030 [US6] Create `src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.ts` and `…QueryHandler.ts`, with `(goalkeeperId, page, pageSize)`:
  - profile check;
  - `countForGoalkeeper` + `pageWindow` + upcoming/past reads (as 009);
  - one `findByIds` for the requests, the names, and `loadContacts` for the clients;
  - `toAgendaItem`.

  Add `tests/unit/application/features/goalkeeperRequests/listGoalkeeperAgendaQueryHandler.test.ts` (order, isolation, empty, contact).
- [X] T031 [US6] Add `GET /me/bookings` to `src/controllers/goalkeeperController.ts` (pagination schema, 404 for a non-goalkeeper). Register it in `di.ts` and the test factory. Add `tests/http/controllers/goalkeeperAgenda.test.ts` (an accepted booking appears with the client contact; another goalkeeper's does not; pagination 400).

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T032 [P] Update `src/infrastructure/openapi/openapiSpec.ts`:
  - the 3 new endpoints and their schemas (`AvailableBookingItem`, `AvailableBookingsPage`, `AgendaItem`, `AgendaPage`, `Contact`);
  - `BookingItemResponse` gains `goalkeeper` and `assignedAt`;
  - the quote's 422 `missing` may include `commission`.
- [X] T033 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T034 Manual, deferred to the end of the roadmap like 010/011, per `specs/012-accept-goalkeeper-booking/quickstart.md`: §2 release cleanup and settings, §3 walk-through, §4 concurrency (SC-001, SC-002).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (T002–T012, must end green) → **US1** (T013–T017) and **US2** (T018–T023) → **US3/US4** (tests over US2) → **US5** (T028–T029) → **US6** (T030–T031) → **Polish**.
- US1 and US2 are independent of each other after Phase 2 (they share T013's item builders: do T013 first).
- US6 uses US5's `loadContacts` (T028).

### Parallel opportunities
- Phase 2: T002 ∥ T003 ∥ T004 ∥ T005; then T006; then T007 ∥ T008 ∥ T009; then T010 → T011 → T012.
- US2: T018 ∥ T019; T021 after T020.
- US3/US4 tests: T024 ∥ T025 ∥ T026 ∥ T027 (T024 and T026 share a file: sequential; so do T025 and T027).

## Implementation Strategy

1. Phase 1–2: the fixed fields through the chain, green.
2. US1 + US2: the MVP (goalkeepers find and take matches; the platform charges).
3. US3 + US4: prove the guarantees and refusals.
4. US5 + US6: contacts and agenda.
5. Polish. Manual checks at the end of the roadmap.

## Notes

- The acceptance charge uses 011's `appendMovementInSession` inside the acceptance transaction: never `WalletLedger.chargeCommission` (that one opens its own transaction).
- The release needs the dev cleanup of `bookings`, `goalkeeperRequests` and `quotes` (quickstart §2).
