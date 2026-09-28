---

description: "Task list for Booking Expiry and \"Cancel All\""
---

# Tasks: Booking Expiry and "Cancel All"

**Input**: Design documents from `/specs/016-booking-expiry-cancel-all/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/lifecycle-changes.md, quickstart.md

**Tests**: Included, per the repository convention:
- hand-written fakes plus `FixedClock`;
- stores tested on `tests/fakes/fakeMongoCollection.ts` with a mocked `withTransaction` (as 012's `bookingAcceptanceStore.test.ts` does);
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })`, the helpers in `tests/http/walletTestHelpers.ts` (`signInClient`, `signInGoalkeeper`, `createRequestAsClient`, `ownerOf`, `MATCH_NOW`), and `context.mediator.send(new RunSweepCommand())` to run a sweep;
- no real database or messaging.

**Organization**:
- Phase 2 adds the shared model and plumbing: fields, status, events, the refund draft, the inbox `dedupeKey`, the lifecycle store port and its fake, and the outcome messages.
- US1: expiry.
- US2: "cancel all", including the late-request refusal (clarification 1).
- US3: outcome visibility.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US3 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 No new configuration is needed: the thresholds come from each request and booking. Confirm by reading `src/infrastructure/config.ts` and record it in the plan's notes if anything is missing. Nothing to change is expected.

---

## Phase 2: Foundational (shared model and plumbing)

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

### Domain

- [X] T002 [P] `src/domain/bookings/booking.ts`: add to `BookingProps` and the class:
  - `endedAt: Date | null`;
  - `endReason: 'search_ended' | 'cancel_all' | null` (export `BookingEndReason`);
  - `cancelledBy: 'system' | null`.

  Defaults are `null` in `forRequest`. In `src/infrastructure/persistence/mongo/bookingRepository.ts`, `bookingFromDocument` reads them (absent means `null`), and the document writer of `MongoQuoteConfirmationStore` (or wherever bookings are serialized) writes them. Update `tests/fixtures/offerFixtures.ts` `buildBooking` defaults and any test that builds `BookingProps` literally.
- [X] T003 [P] `src/domain/bookings/goalkeeperRequest.ts`: add `cancelAllEvaluatedAt: Date | null` (default `null` in `fromQuote`), and `cancelAllUntil(): Date` (= `freeCancellationUntil()`) with a doc comment. `src/infrastructure/persistence/mongo/goalkeeperRequestRepository.ts` reads and writes it (absent means `null`). Update `tests/fixtures/quoteFixtures.ts` `buildRequest`.
- [X] T004 [P] `src/domain/bookings/requestStatus.ts`: add `'cancelled' | 'expired'` per data-model.md, in the order: pending checks, `assigned`, `completed`, `cancelled`, `expired`, `closed`. Extend `tests/unit/domain/bookings/requestStatus.test.ts`: all cancelled; cancelled plus expired → `cancelled`; all expired; assigned plus expired → `assigned`.
- [X] T005 [P] Events:
  - `src/domain/events/domainEvent.ts`: `DomainEventType` gains `'booking.expired' | 'booking.cancelled'`;
  - `src/domain/events/bookingEvents.ts`: `bookingExpired(id, booking, at)` (payload `{ clientId, zoneId, startsAt }`) and `bookingCancelled(id, booking, at, refund: { amount: number; currency: string } | null)` (payload per data-model.md, with `reason: 'cancel_all'`, `by: 'system'`);
  - `src/application/features/events/common/eventSchemas.ts`: zod schemas for both types (dates revived);
  - `src/application/features/events/handlers/logEventDelivery.ts`: add both to `DELIVERY_LOG_EVENT_TYPES`.

  Tests: extend `tests/unit/domain/events/bookingEvents.test.ts` and `tests/unit/application/features/events/eventSchemas.test.ts`.
- [X] T006 [P] `src/application/features/wallet/common/walletLedger.ts`: extract and export `commissionRefundDraft(owner, { bookingId, requestId, amount, cancellation }, id, occurredAt): MovementDraft`:
  - type `commission_refund`, amount `+amount`;
  - `causeKey: commission_refund:{bookingId}`;
  - actor system;
  - references `{ bookingId, requestId }`;
  - the cancellation.

  Make `refundCommission` build its movement through it (behavior unchanged: the 011 tests must stay green). Add a unit test of the draft.
- [X] T007 [P] `src/domain/notifications/outcomeMessages.ts` (reuse `localWhen` from `offerMessages.ts`). Every function takes `{ zoneName, cityName, startsAt, timeZone }` plus its specifics and returns a `PushMessage` per contracts/lifecycle-changes.md:
  - `requestExpiredMessage(match, requestId)`;
  - `requestPartiallyExpiredMessage(match, requestId, assigned, total)`;
  - `requestCancelledMessage(match, requestId)`;
  - `bookingCancelledMessage(match, requestId, bookingId, refund: { amount, currency } | null)`, where the amount is formatted as `7.000 COP` with an es-CO thousands separator.

  Export the type constants. Add `tests/unit/domain/notifications/outcomeMessages.test.ts`: texts, data keys, and `validatePushMessage` passes.

### Ports, stores, fakes

- [X] T008 Ports:
  - `src/application/features/bookingLifecycle/common/ports.ts`: `IBookingLifecycleStore` with:
    - `expire(requestId, now, buildEvents: (expired: Booking[]) => DomainEvent[]): Promise<{ expired: Booking[]; events: DomainEvent[]; deactivated: boolean }>`;
    - `cancelAll(args: { requestId; now; owners: Map<goalkeeperId, LedgerOwner>; newId: () => string; buildEvent: (booking: Booking, refund: { amount; currency } | null) => DomainEvent }): Promise<{ kind: 'already_evaluated' } | { kind: 'kept' } | { kind: 'cancelled'; cancelled: Booking[]; refunds: number; events: DomainEvent[] } | { kind: 'missing_charge'; bookingId }>`;
  - also `ILifecycleLogger { info; warn }`;
  - `IBookingRepository`: `findDueForExpiry(now, cap)`;
  - `IGoalkeeperRequestRepository`: `findDueForCancelAll(now, cap)`;
  - `INotificationRepository` (015): `createIfAbsent(entry: NewNotification & { dedupeKey: string }): Promise<boolean>`, where `NewNotification = { id; userId; type; title; body; data; createdAt }`.
- [X] T009 [P] Mongo reads:
  - `bookingRepository.ts` `findDueForExpiry`: `find({ status: 'pending_assignment', searchEndsAt: { $lte: now } }).sort({ searchEndsAt: 1 }).limit(cap)`;
  - `goalkeeperRequestRepository.ts` `findDueForCancelAll`: `find({ partialFulfillment: 'cancel_all', active: true, cancelAllEvaluatedAt: null, startsAt: { $lte: now + 24 h } }).limit(cap * 4)`, then filter `now >= cancelAllUntil()` and slice to `cap`; add index `cancelAll_due` `{ partialFulfillment: 1, cancelAllEvaluatedAt: 1, startsAt: 1 }`;
  - `notificationRepository.ts` `createIfAbsent`: `insertOne` with `dedupeKey`, where E11000 → `false`; add index `dedupe_unique` `{ dedupeKey: 1 }`, unique, `partialFilterExpression: { dedupeKey: { $exists: true } }`.

  Tests: extend `tests/unit/infrastructure/persistence/mongo/offerQueries.test.ts` and `notificationRepository.test.ts`.
- [X] T010 `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`: `MongoBookingLifecycleStore(startSession, db)`, following research §2 and §3 and 012's `bookingAcceptanceStore.ts` style (`withTransaction` with snapshot/majority/primary; an abort class for business outcomes).
  - **`expire`**:
    1. `find` the due ids in the session;
    2. an `updateMany` conditional on those ids + `status: 'pending_assignment'` + `searchEndsAt ≤ now`, setting `status: 'expired'`, `endedAt`, `endReason: 'search_ended'`;
    3. re-read the updated bookings, `appendEventsInSession(buildEvents(expired))`;
    4. if `countDocuments({ requestId, status: { $in: ['pending_assignment', 'assigned'] } }) === 0`, then `updateOne(request, { $set: { active: false } })`.
  - **`cancelAll`**:
    1. the gate `findOneAndUpdate({ _id, cancelAllEvaluatedAt: null }, { $set: { cancelAllEvaluatedAt: now } })`; `null` → `already_evaluated`;
    2. read the bookings; all assigned → `kept`;
    3. otherwise, for each pending or assigned booking, a conditional update to `cancelled` (`endedAt`, `endReason: 'cancel_all'`, `cancelledBy: 'system'`, keeping `goalkeeperId`); for assigned ones, find `commission:{id}` in `walletMovements` (in the session), and if it's missing abort with `missing_charge`, otherwise `appendMovementInSession(commissionRefundDraft(owner, …, newId(), now))`;
    4. `appendEventsInSession`;
    5. `$set active: false` on the request.

  Add `tests/unit/infrastructure/persistence/mongo/bookingLifecycleStore.test.ts` on mocked collections: filters and updates, the gate, kept, cancelled with a refund, `missing_charge` aborts, events inserted with the session.
- [X] T011 [P] `tests/fakes/fakeBookingLifecycleStore.ts`: in-memory over `FakeBookingRepository`, `FakeGoalkeeperRequestRepository`, `FakeWalletStore` and `FakeOutboxStore`. It has the same conditional semantics, synchronous between reads and writes, so concurrent calls behave like the transactions. The refund goes through the fake wallet store's append, which is idempotent by `causeKey`. Also add `createIfAbsent` to `tests/fakes/fakeNotificationRepository.ts`, and `findDueForExpiry` / `findDueForCancelAll` to the booking and request fakes.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - A booking nobody took expires, and the client is told (Priority: P1) 🎯 MVP

**Goal**: The `booking-expiry` job expires due bookings once, records events, deactivates finished requests and notifies the client once per request.

**Independent Test**:
- A 2-goalkeeper "keep confirmed" request, one booking accepted, then a sweep after the search end: one booking expired, the other still assigned, 1 client notice.
- A second sweep: nothing new.
- Accepting the expired booking is refused.

- [X] T012 [US1] `src/application/features/bookingLifecycle/jobs/bookingExpiryJob.ts`: `BookingExpiryJob implements IScheduledJob`, `name = 'booking-expiry'`, `leaseSeconds = 55`, with deps `{ bookingRepository, store, relay: IEventRelay, idGenerator, logger, cap = 500 }`. `run(now)`:
  1. `findDueForExpiry`, grouped by `requestId`;
  2. per request, inside a try/catch that logs `lifecycle_item_failed` and continues: `store.expire(requestId, now, (expired) => expired.map((b) => bookingExpired(newId(), b, now)))`, then `await relay.relay(events)`;
  3. log `bookings_expired { requests, bookings }` and return a summary.

  Unit tests with `FakeBookingLifecycleStore`:
  - due → expired and events;
  - not due → untouched;
  - assigned → untouched;
  - a second run → nothing;
  - two concurrent `run()` → each booking expired once;
  - one request failing doesn't stop the others;
  - a request left with nothing pending or assigned becomes inactive.
- [X] T013 [US1] `src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.ts`: `ClientOutcomeNoticeHandler implements INotificationHandler<DomainEvent>`, `name = 'client-outcome-notices'`, types `['booking.expired', 'booking.cancelled']`, via `runOnce`. It:
  1. loads the request and its bookings and the zone and city names (reuse `loadBookingItemContext` or the repositories);
  2. returns if any booking is still pending (the outcome isn't final yet);
  3. picks the message: any cancelled → `requestCancelledMessage`; else none assigned → `requestExpiredMessage`; else `requestPartiallyExpiredMessage(assigned, total)`;
  4. calls `notifications.createIfAbsent({ dedupeKey: 'request-outcome:' + requestId, userId: clientId, … })`, and if it was created, `pushNotifier.sendToUsers([clientId], message)`;
  5. logs `outcome_notice_sent`.

  Unit tests:
  - all expired → 1 `request.expired`;
  - assigned plus expired → `request.partially_expired`, "1 de 2";
  - both events of a request → 1 notice;
  - 5 deliveries → 1;
  - still pending → none.
- [X] T014 [US1] Wiring:
  - `src/infrastructure/di.ts`: `MongoBookingLifecycleStore`, `requestRepository.ensureIndexes()` (for the new index), `BookingExpiryJob` in `jobs: [...]` before `OfferRemindersJob`, and `ClientOutcomeNoticeHandler` subscribed to both types;
  - `tests/http/testAppFactory.ts`: the same with fakes, exposing `context.lifecycleStore` if useful.

  Update `tests/http/controllers/internalEvents.test.ts`'s sweep report expectation to list the new jobs.
- [X] T015 [P] [US1] HTTP test `tests/http/controllers/bookingExpiry.test.ts`, with `MATCH_NOW` and `createRequestAsClient`. The search ends at 19:30Z:
  - `context.clock.set('2026-09-21T19:31:00.000Z')` then `RunSweepCommand`: the booking is `expired`, `GET /api/goalkeeper-requests/bookings` shows status `expired`, `context.notificationRepository.all()` has 1 `request.expired` for the client, and `context.pushSender` has 1 call to the client;
  - "keep confirmed" with one accepted → `request.partially_expired`, the assigned booking is untouched, and the goalkeeper's wallet has no new movement;
  - a second sweep → no change;
  - accepting the expired booking → `409 search_ended` or `404 booking_not_available` (assert whichever 012's `classify` gives: expired → `not_available` → 404);
  - available matches no longer list it;
  - a new request for the same zone and start is now allowed (FR-019: quote and confirm again → 201).

**Checkpoint**: SC-001, SC-003 and SC-006 for expiry.

---

## Phase 4: User Story 2 - "Cancel all" is applied automatically when the match isn't complete (Priority: P1)

**Goal**: The `cancel-all` job cancels incomplete "cancel all" requests once, refunds, records events and notifies. The quote and the confirmation apply clarification 1.

**Independent Test**:
- A 2-goalkeeper "cancel all" request, A accepts one, then a sweep at start − 60: both cancelled, A refunded 7.000 once, A and the client notified once each.
- Again: nothing.
- A late "cancel all" confirmation → 409.

- [X] T016 [US2] `src/application/features/bookingLifecycle/jobs/cancelAllJob.ts`: `CancelAllJob implements IScheduledJob`, `name = 'cancel-all'`, `leaseSeconds = 55`, with deps `{ requestRepository, bookingRepository, store, walletContext (GoalkeeperWalletContextDependencies), relay, idGenerator, logger, cap = 500 }`. Per due request, inside a try/catch:
  1. load its bookings;
  2. resolve the ledger owners of the assigned goalkeepers with `resolveGoalkeeperWalletContext`; any `wallet_not_configured` or `not_a_goalkeeper` → log `cancel_all_skipped` and continue;
  3. `store.cancelAll({ requestId, now, owners, newId, buildEvent: (b, refund) => bookingCancelled(newId(), b, now, refund) })`;
  4. `missing_charge` → log a warning and continue;
  5. `cancelled` → `relay.relay(events)`;
  6. count kept, cancelled, refunds and skipped; log `cancel_all_evaluated` and return a summary.

  Unit tests:
  - not all assigned → all cancelled plus refunds;
  - all assigned → kept, and never evaluated again;
  - "keep confirmed" → never picked;
  - not yet due → untouched;
  - a second run → nothing;
  - two concurrent `run()` → one refund per booking;
  - an expired booking in the request stays expired and triggers the cancellation;
  - a skipped request is retried later.
- [X] T017 [US2] `src/application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.ts`: `name = 'goalkeeper-cancellation-notices'`, type `booking.cancelled`, via `runOnce`. Only when `payload.goalkeeperId` is set: `createIfAbsent({ dedupeKey: 'booking-cancelled:' + bookingId, userId: goalkeeperId, type: 'booking.cancelled', … bookingCancelledMessage(…, payload.refundedAmount) })`, then push if created. Unit tests: a goalkeeper booking → 1 notice with the amount; a pending (no goalkeeper) booking → none; repeats → 1.
- [X] T018 [US2] Wiring in `di.ts` and `testAppFactory.ts`: `CancelAllJob` **first** in `jobs: [...]`, then the expiry job, then the offer reminders; subscribe `GoalkeeperCancellationNoticeHandler`.
- [X] T019 [US2] Clarification 1:
  - `issueServiceQuoteCommand.ts` / `…Handler.ts`: `IssuedServiceQuote` gains `cancelAllUntil` (ISO of start − `freeCancellationMinutes` stored on the quote) and `cancelAllAvailable` (`now < cancelAllUntil`);
  - `confirmBookingCommand.ts`: new outcome `{ outcome: 'cancel_all_not_available'; cancelAllUntil: string }`;
  - `confirmBookingCommandHandler.ts`: after the replay check, if `command.partialFulfillment === 'cancel_all'`, load `quoteRepository.findByIdForClient(quoteId, clientId)`, and when found and `now >= start − freeCancellationMinutes`, return it (audited through `finish`);
  - `src/controllers/goalkeeperRequestsController.ts`: map it to `ApiError(409, 'cancel_all_not_available', 'This match starts too soon to choose "cancel all"; confirm keeping the confirmed goalkeepers.', undefined, { cancelAllUntil })`.

  Update the booking audit outcome union if typed. Unit tests in `confirmBookingCommandHandler.test.ts`: late `cancel_all` refused and nothing claimed; late `keep_confirmed` accepted; early `cancel_all` accepted; a replay still answers. `issueServiceQuote` test: both flags.
- [X] T020 [P] [US2] HTTP test `tests/http/controllers/cancelAll.test.ts`:
  - C confirms a 2-goalkeeper match with `partialFulfillment: 'cancel_all'`, with a quote ≥ 60 min ahead (for example, starting 15:00 local with the clock 1 hour earlier than `MATCH_NOW`; adjust `startsAt` so `cancelAllAvailable` is true);
  - G (funded) accepts one booking;
  - `context.clock.set(start − 59 min)`, then `RunSweepCommand`: both bookings `cancelled`; G's wallet movements include a `commission_refund` of 7000 with `cancellation.by: 'system'` and `cancellation.reason: 'cancel_all'`; G's balance is back to the original; notices `booking.cancelled` (G) and `request.cancelled` (C), one each; G's agenda shows `status: 'cancelled'`;
  - a second sweep → no second refund or notice;
  - a fully assigned "cancel all" request → kept (both assigned after the sweep), and a later sweep doesn't touch it;
  - a late quote → `cancelAllAvailable: false`, confirming it with `cancel_all` → `409 cancel_all_not_available`, and with `keep_confirmed` → 201.

**Checkpoint**: SC-002, SC-003, SC-004 and SC-008.

---

## Phase 5: User Story 3 - The request shows how it ended (Priority: P2)

**Goal**: The outcome statuses are visible, and finished requests stop blocking new ones.

**Independent Test**: The request list shows `expired` and `cancelled`, the agenda shows `cancelled`, and a new request for the same match is allowed.

- [X] T021 [US3] Verify the request views (`requestResponse.ts`) and the agenda (`goalkeeperBookingResponse.ts` / `listGoalkeeperAgenda`) pass the new statuses through unchanged. Add unit assertions in `listClientRequestsQueryHandler.test.ts` (an `expired` request, a `cancelled` request) and in `listGoalkeeperAgendaQueryHandler.test.ts` (a cancelled booking listed with status `cancelled`). Confirm clash checks only count `assigned` (012's `findAssignedToGoalkeeper`); add one unit case where a cancelled booking doesn't block accepting a clashing new one.
- [X] T022 [P] [US3] Extend `tests/http/controllers/bookingExpiry.test.ts` and `cancelAll.test.ts` with the FR-019 re-request assertions, if not already covered in T015 and T020.

**Checkpoint**: SC-007.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] `src/infrastructure/openapi/openapiSpec.ts`:
  - the quote schema gains `cancelAllAvailable` and `cancelAllUntil`;
  - the confirmation gains `409 cancel_all_not_available` (`cancelAllUntil`);
  - the request and booking status enums gain `expired` and `cancelled`.

  `docs/push-notifications.md`: add the 4 new `data.type` values and where the app opens them.
- [X] T024 [P] Add "10. Vencimientos y cancelar todo (spec 016)" to `_temp_pruebas.md` (git-ignored, Spanish), from quickstart §1–§4.
- [X] T025 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T026 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §10): the dev-cluster walk-through, and concurrency (accept vs. expiry, accept vs. "cancel all", two parallel sweeps).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (must end green) → **US1** → **US2** → **US3** → **Polish**.
- US2 reuses US1's wiring and the `ClientOutcomeNoticeHandler`, which already handles `booking.cancelled`.
- US3 mostly verifies what US1 and US2 produced.

### Parallel opportunities

- Phase 2: T002 ∥ T003 ∥ T004 ∥ T005 ∥ T006 ∥ T007; then T008; then T009 ∥ T011; T010 after T008.
- US1: T012 ∥ T013; then T014; then T015.
- US2: T016 ∥ T017 ∥ T019; then T018; then T020.
- Polish: T023 ∥ T024.

## Implementation Strategy

1. Phase 1–2: model, events, refund draft, store, green.
2. US1: expiry. The MVP: no booking stays "searching" forever.
3. US2: "cancel all" plus the late-request rule.
4. US3 + Polish.

## Notes

- **Exactly-once comes from conditions**, not from the job lock alone: the status conditions for expiry, and the `cancelAllEvaluatedAt` gate and the refund `causeKey` for "cancel all".
- **The refund `causeKey` is `commission_refund:{bookingId}`**, the same as 011's `refundCommission`, so 017 can never refund the same booking again.
- **Notices are event consumers with a `dedupeKey`**: at least once delivery, exactly one notice.
- **No new npm dependency.**
