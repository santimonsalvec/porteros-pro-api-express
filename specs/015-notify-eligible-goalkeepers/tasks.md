---

description: "Task list for Notify Eligible Goalkeepers of Available Matches"
---

# Tasks: Notify Eligible Goalkeepers of Available Matches

**Input**: Design documents from `/specs/015-notify-eligible-goalkeepers/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/notifications-and-offers.md, quickstart.md

**Tests**: Included, per the repository convention:
- hand-written fakes plus `FixedClock`;
- repositories tested on `tests/fakes/fakeMongoCollection.ts`;
- HTTP tests with `await buildTestApp()` and the sign-in helpers in `tests/http/walletTestHelpers.ts` (`signInClient`, `signInGoalkeeper`, `createRequestAsClient`, `MATCH_NOW`);
- **no real FCM or Pub/Sub**. Pushes are asserted on `context.pushSender` (014's `FakePushSender`).

**Organization**:
- Phase 2 builds the shared core: the predicate, the messages, the ports, the repositories, the fakes, the two eligibility services and `offerSender`.
- The stories then follow:
  - US1: the first notification;
  - US4: the switch (P1; it gates eligibility and 012, so it comes before the reminders);
  - US2: reminder rounds;
  - US3: the inbox endpoints.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 Extend `src/infrastructure/config.ts` with `config.offers = { reminderIntervalMinutes: Number(optionalEnv('OFFER_REMINDER_INTERVAL_MINUTES', '5')), maxReminders: Number(optionalEnv('OFFER_MAX_REMINDERS', '3')), roundCap: 2000 }` and `assertOffersConfig()`, which throws when either value is not a positive integer (mirror `assertPushConfig`). Add both variables with comments to `.env.example` under "Offers to goalkeepers (feature 015)".

---

## Phase 2: Foundational (shared eligibility and offer machinery)

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

### Domain

- [X] T002 [P] Add `availableForOffers: boolean` to `src/domain/goalkeepers/goalkeeperProfile.ts`: a constructor param `availableForOffers?: boolean`, default `true`, with a doc comment ("Off: no offers, no available matches, cannot accept — feature 015"). `createFromRegistration` leaves it `true`. In `src/infrastructure/persistence/mongo/goalkeeperProfileRepository.ts`:
  - `toDocument` writes it;
  - `fromDocument` reads `doc.availableForOffers !== false`, so an absent field means on.

  Update `tests/fixtures/walletFixtures.ts` `buildGoalkeeperProfile` overrides to accept `availableForOffers` and `suspendedUntil`.
- [X] T003 [P] Create `src/domain/bookings/offerEligibility.ts`:
  - `OfferSnapshot { goalkeeperId; zoneIds: readonly string[]; availableForOffers: boolean; suspendedUntil: Date | null; balance: number; canSeeOffers: boolean; held: readonly Commitment[] }`;
  - `isEligible(snapshot, booking: Booking, now): boolean`, per research §1. Reuse `canAfford`, `holdsSameRequest`, `firstConflict` and `booking.isSearchOpenAt(now)`.

  Add `tests/unit/domain/bookings/offerEligibility.test.ts`: a base eligible case, then one failing case per rule (switch off, suspended now vs. ended, `canSeeOffers` false, commission > balance, zone not enabled, not pending, search ended, own request, same request held, clash with a held booking).
- [X] T004 [P] Create `src/domain/notifications/offerMessages.ts`:
  - `singleOfferMessage({ zoneName, cityName, startsAt, timeZone, durationMinutes, requestId, bookingId }): PushMessage`: title `Partido disponible`, body `${place} · ${when} · ${durationMinutes} min`, `data { type: 'booking.available', requestId, bookingId }`;
  - `groupedOfferMessage(count): PushMessage`: title `Partidos disponibles`, body `Hay ${count} partidos disponibles en tus zonas`, `data { type: 'bookings.available' }`.

  `place` is `zoneName ?? cityName ?? 'tu zona'`. `when` uses `Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone })`, assembled from `formatToParts` as `sáb 4 oct, 3:00 p. m.`: the weekday and month without trailing dots, and `p. m.`/`a. m.` as Node's ICU renders them for es-CO (assert the actual output in the test and keep it stable). Export `OFFER_TYPE = 'booking.available'` and `OFFERS_LIST_TYPE = 'bookings.available'`.

  Add `tests/unit/domain/notifications/offerMessages.test.ts`: a Bogotá match at 20:00Z renders 3:00 p. m. local; the zone, city and default fallbacks; the grouped text; the data keys; `validatePushMessage(...)` from 014 accepts both.

### Ports, repositories, fakes

- [X] T005 Create `src/application/features/notifications/common/ports.ts`:
  - `NotificationItem { id; userId; type; title; body; data; createdAt; readAt; requestId?; dismissedAt?; notifiedAt?; reminderCount?; lastRemindedAt? }`;
  - `NewOffer { id; userId; requestId; title; body; data; createdAt }`;
  - `INotificationRepository`: `createOfferIfAbsent(offer): Promise<boolean>`; `listForUser(userId, skip, limit)`; `countForUser(userId)`; `countUnread(userId)`; `markRead(id, userId, now): Promise<boolean>`; `markAllRead(userId, now)`; `dismissOffer(id, userId, now): Promise<'dismissed' | 'not_found' | 'not_an_offer'>`; `findOffers(userIds, requestIds): Promise<NotificationItem[]>`; `markNotified(ids, now)`; `markReminded(ids, now)`;
  - `IOfferPushState`: `tryClaim(goalkeeperId, now, intervalMinutes): Promise<boolean>`; `markPushed(goalkeeperIds, now)`;
  - `IOffersLogger { info; warn }`.

  Extend the existing ports:
  - `IGoalkeeperProfileRepository` (`src/application/features/goalkeepers/common/ports.ts`): `findOfferCandidates(zoneIds: string[]): Promise<GoalkeeperProfile[]>`; `setAvailableForOffers(userId, value): Promise<{ previous: boolean } | null>`;
  - `IWalletRepository` (`src/application/features/wallet/common/ports.ts`): `findByGoalkeeperIds(ids): Promise<Wallet[]>`;
  - `IBookingRepository` (`src/application/features/goalkeeperRequests/common/ports.ts`): `findOpenPending(now, cap): Promise<Booking[]>`; `findAssignedToGoalkeepers(ids): Promise<Booking[]>`.
- [X] T006 [P] Implement the extensions in Mongo, with tests on mocked collections:
  - `goalkeeperProfileRepository.ts`:
    - `findOfferCandidates`: `find({ zoneIds: { $in }, availableForOffers: { $ne: false } })`; an empty zone list returns `[]` without a query;
    - `setAvailableForOffers`: `findOneAndUpdate({ userId }, { $set: { availableForOffers: value } }, { returnDocument: 'before' })`, returning `{ previous: doc.availableForOffers !== false }` or `null`;
    - index `zone_offers` `{ zoneIds: 1, availableForOffers: 1 }`.
  - `walletRepository.ts` `findByGoalkeeperIds`: an `$in` read; empty returns `[]`. Check the document's owner field name in the existing `findByGoalkeeperId` and mirror it.
  - `bookingRepository.ts`:
    - `findOpenPending`: `find({ status: 'pending_assignment', searchEndsAt: { $gt: now } }).sort({ startsAt: 1, _id: 1 }).limit(cap)`;
    - `findAssignedToGoalkeepers`: `find({ goalkeeperId: { $in }, status: 'assigned' })`;
    - index `status_searchEnds` `{ status: 1, searchEndsAt: 1 }`.

  Extend the three repositories' existing unit tests.
- [X] T007 [P] Create `src/infrastructure/persistence/mongo/notificationRepository.ts` (`NOTIFICATIONS_COLLECTION = 'notifications'`), `MongoNotificationRepository implements INotificationRepository`:
  - `createOfferIfAbsent`: `insertOne({ _id, userId, type: 'booking.available', title, body, data, requestId, createdAt, readAt: null, dismissedAt: null, notifiedAt: null, reminderCount: 0, lastRemindedAt: null })`. It returns `true`, or `false` on E11000.
  - `listForUser`: `find({ userId }).sort({ createdAt: -1, _id: -1 }).skip().limit()`.
  - `countUnread`: `countDocuments({ userId, readAt: null })`.
  - `markRead`: `updateOne({ _id, userId }, [{ $set: { readAt: { $ifNull: ['$readAt', now] } } }])`, so an existing `readAt` is kept; returns `matchedCount === 1`.
  - `markAllRead`: `updateMany({ userId, readAt: null }, { $set: { readAt: now } })`.
  - `dismissOffer`: `findOne({ _id, userId })`. `null` → `not_found`; another type → `not_an_offer`; otherwise `updateOne` setting `dismissedAt` and `readAt` only when null (the same `$ifNull` pipeline) → `dismissed`.
  - `findOffers`: `find({ userId: { $in }, requestId: { $in }, type: 'booking.available' })`.
  - `markNotified`: `updateMany({ _id: { $in }, notifiedAt: null }, { $set: { notifiedAt: now } })`.
  - `markReminded`: `updateMany({ _id: { $in } }, { $inc: { reminderCount: 1 }, $set: { lastRemindedAt: now } })`.
  - `ensureIndexes()`:
    - `user_created`;
    - `offer_unique`, unique, with `partialFilterExpression: { type: 'booking.available' }`;
    - `created_ttl`, `expireAfterSeconds: 7776000`.

  Every `_id` filter first checks `uuid.validate(id)` and treats an invalid id as not found. Add `tests/unit/infrastructure/persistence/mongo/notificationRepository.test.ts`.
- [X] T008 [P] Create `src/infrastructure/persistence/mongo/offerPushStateStore.ts` (`offerPushState`):
  - `tryClaim`: `findOneAndUpdate({ _id: goalkeeperId, lastOfferPushAt: { $lte: now − interval } }, { $set: { lastOfferPushAt: now } }, { upsert: true })` → `true`; E11000 → `false`; other errors rethrow;
  - `markPushed`: a `bulkWrite` of `updateOne({ _id }, { $set: { lastOfferPushAt: now } }, { upsert: true })` per goalkeeper, or a loop of `updateOne`. Add `bulkWrite` to `tests/fakes/fakeMongoCollection.ts` if used.

  Add a unit test.
- [X] T009 [P] Fakes:
  - `tests/fakes/fakeNotificationRepository.ts`: in memory, with the same semantics (unique per user + request for offers; the `markRead` / `dismiss` rules) and `all()`;
  - `tests/fakes/fakeOfferPushState.ts`, which honors the interval.

  Extend the existing fakes:
  - `FakeGoalkeeperProfileRepository`: `findOfferCandidates`, `setAvailableForOffers`;
  - `FakeWalletStore`: `findByGoalkeeperIds`;
  - `FakeBookingRepository`: `findOpenPending`, `findAssignedToGoalkeepers`.

### Eligibility services and the shared sender

- [X] T010 Create `src/application/features/notifications/common/offerEligibilityService.ts`: `OfferEligibilityService`, with deps `{ goalkeeperProfileRepository, walletRepository, commissionResolver, bookingRepository, clock? }`.
  - `snapshotsFor(profiles, now)` loads in batch: wallets by ids, `commissionResolver.resolveForZones(union of zones)`, and assigned bookings by goalkeeper ids. It builds `OfferSnapshot`s, computing `canSeeOffers` with `offersStatus(balance, zones' commissions)`.
  - `eligibleGoalkeepersFor(bookings, now): Promise<Map<goalkeeperId, Booking[]>>`: `findOfferCandidates(distinct zones)`, then `snapshotsFor`, then `isEligible` for each pair.
  - `availableBookingsFor(goalkeeperId, now): Promise<{ kind: 'not_a_goalkeeper' } | { kind: 'unavailable'; reason: 'not_available_for_offers' | 'suspended' | 'insufficient_funds'; missingAmount; suspendedUntil } | { kind: 'ok'; bookings: Booking[]; capReached: boolean }>`. It moves 012's logic here from `ListAvailableBookingsQueryHandler` (profile, then the switch first, then suspended, then `offersStatus`, then `findAvailableCandidates`, then the held filter), and runs the final filter through `isEligible`, so both directions share the predicate.

  Add `tests/unit/application/features/notifications/offerEligibilityService.test.ts`:
  - each unavailable reason, in order;
  - a scenario with 6 goalkeepers (eligible, suspended, poor, clashing, switch off, other zone) and the client-as-goalkeeper;
  - **consistency**: for every (goalkeeper, booking) of a generated world, `booking ∈ availableBookingsFor(g)` ⇔ `g ∈ eligibleGoalkeepersFor(all bookings).keys` with that booking (FR-002).
- [X] T011 Create `src/application/features/notifications/common/offerSender.ts`: `OfferSender`, with deps `{ notifications, pushState, pushNotifier, idGenerator, zoneRepository, cityRepository, requestRepository, logger, maxReminders, intervalMinutes }`. `send(byGoalkeeper: Map<goalkeeperId, Booking[]>, now, mode: 'first' | 'catchUp' | 'round'): Promise<OfferSendReport>`:
  1. Group each goalkeeper's bookings by request. The representative booking is the earliest `createdAt`.
  2. Load the requests (for the match), zone names and city names with `loadBookingItemContext` from `goalkeeperRequests/common/goalkeeperBookingResponse.ts`. Build each request's `singleOfferMessage`.
  3. `createOfferIfAbsent` per (goalkeeper, request). Remember which ones were inserted now.
  4. **Offers to push per goalkeeper**:
     - `first`: only the ones inserted by this call;
     - `catchUp`: only the ones inserted by this call;
     - `round`: `findOffers` for those goalkeepers and requests, keeping `readAt == null && dismissedAt == null && (notifiedAt == null || reminderCount < maxReminders)`.
  5. **Claim**:
     - `first` and `catchUp`: every goalkeeper with ≥ 1 offer to push, then `pushState.markPushed`;
     - `round`: `pushState.tryClaim(g, now, intervalMinutes)` per goalkeeper, skipping the losers.
  6. **Message per goalkeeper**: 1 offer → that request's single message; N ≥ 2 → `groupedOfferMessage(N)`. Group goalkeepers by identical message and call `pushNotifier.sendToUsers(userIds, message)` once per group, with at most 10 groups in flight (reuse `runWithConcurrency` from `features/devices/common`).
  7. `markNotified` for pushed offers with `notifiedAt == null`, and `markReminded` for the others.
  8. Return `{ goalkeepers, entriesCreated, pushed, reached, removed, failed }`.

  Never throws past a logged `offer_send_failed`, returning what was done. Add `tests/unit/application/features/notifications/offerSender.test.ts` with `FakeNotificationRepository`, `FakeOfferPushState` and 014's `PushNotifier` over `FakeDeviceRepository` / `FakePushSender`:
  - `first` pushes only the inserted offers, and a second call with the same input pushes nothing;
  - `round` groups 3 offers into one push, and a single offer gets the match text;
  - read, dismissed and capped offers are excluded;
  - `notifiedAt == null` offers count as first, not as reminders;
  - a claim within the interval skips;
  - a grouped push increments every covered offer.

**Checkpoint**: tsc and `npm test` are green. Nothing is wired yet.

---

## Phase 3: User Story 1 - Eligible goalkeepers hear about a new match right away (Priority: P1) 🎯 MVP

**Goal**: `booking.created` gives one offer and one push per eligible goalkeeper and request.

**Independent Test**: A confirmed 2-goalkeeper request notifies only the eligible goalkeeper, once. Re-delivering the events changes nothing.

- [X] T012 [US1] Create `src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommand.ts` (`NotifyBookingOffersCommand(bookingId)`, result `{ outcome: 'notified'; report } | { outcome: 'skipped'; reason: 'not_found' | 'not_open' }`) and `notifyBookingOffersCommandHandler.ts`:
  1. load the booking;
  2. skip if it isn't pending or its search ended;
  3. `eligibility.eligibleGoalkeepersFor([booking], now)`;
  4. `offerSender.send(map, now, 'first')`;
  5. log `offers_notified { bookingId, requestId, eligible, ...report }`.

  Add unit tests: the eligibility scenario, not open → skipped, a repeat → 0 new pushes.
- [X] T013 [US1] Create `src/application/features/notifications/handlers/notifyBookingOffersHandler.ts`: `NotifyBookingOffersHandler implements INotificationHandler<DomainEvent>`, `name = 'goalkeeper-offers'`. `handle(event)` runs `runOnce(processedStore, clock, name, event.id, () => sender.send(new NotifyBookingOffersCommand(event.bookingId)))`. Export `OFFER_EVENT_TYPES = ['booking.created']`. Add a unit test: 5 deliveries → the command is sent once.
- [X] T014 [US1] Wiring:
  - `src/infrastructure/di.ts`:
    - `assertOffersConfig()`;
    - `MongoNotificationRepository` and `MongoOfferPushStateStore`, plus `ensureIndexes`;
    - `OfferEligibilityService`, `OfferSender` (with `pushNotifier` from 014);
    - register `NotifyBookingOffersCommand`;
    - `registerSubscribers` with `NotifyBookingOffersHandler` for `OFFER_EVENT_TYPES`.
  - `tests/http/testAppFactory.ts`: the same, with `FakeNotificationRepository` and `FakeOfferPushState`. Expose `context.notificationRepository` and `context.offerPushState`.
- [X] T015 [P] [US1] HTTP test `tests/http/controllers/offersNotification.test.ts`, using `buildTestApp({ eventsMode: 'local' })`, `MATCH_NOW` and the helpers:
  - eligible goalkeeper G (with funds: seed through `context.walletLedger` as the wallet tests do), plus non-eligible ones: suspended, poor, other zone, switch off (`context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(id, { availableForOffers: false }))`);
  - C confirms a 2-goalkeeper request (`createRequestAsClient`): `context.notificationRepository.all()` has exactly 1 offer, for G; `context.pushSender.calls` has 1 call, for G's device (register one first via `POST /api/devices`), whose body matches `/ · .* · 90 min$/`;
  - re-publishing the same events (`context.mediator.publish(event)` for each outbox event) creates nothing new;
  - the client-as-goalkeeper gets nothing.

**Checkpoint**: SC-001 and SC-002 with fakes.

---

## Phase 4: User Story 4 - A goalkeeper turns offers on or off (Priority: P1)

**Goal**: The switch gates offers, the available list and accepting; turning it on sends the open offers immediately.

**Independent Test**:
- Off: no offers, `unavailableReason: not_available_for_offers`, accepting gives 409.
- On: `offersSent ≥ 1` plus one immediate push; a round within 5 minutes sends nothing more.

- [X] T016 [US4] Refactor `src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.ts` to delegate to `OfferEligibilityService.availableBookingsFor` (keeping pagination, `onCapReached` and the item mapping). Add `'not_available_for_offers'` to `unavailableReason` in `listAvailableBookingsQuery.ts`. Existing 012 tests must stay green. Add a unit and an HTTP case for the switch off (`tests/http/controllers/goalkeeperAvailableBookings.test.ts`).
- [X] T017 [US4] `acceptBookingCommandHandler.ts`: after the `replayed` check and before `suspended`, if `profile && !profile.availableForOffers` → `finish(command, { outcome: 'not_available_for_offers' }, booking)`. Add the outcome to `AcceptBookingResult`, and map it in `src/controllers/goalkeeperController.ts` to `ApiError(409, 'goalkeeper_not_available', 'Turn on availability for offers to take matches.')`. Tests:
  - unit: switch off → refused, no charge; a replay still 200;
  - HTTP in `goalkeeperAcceptBooking.test.ts`: 409, balance unchanged, booking still pending.
- [X] T018 [US4] Create `src/application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.ts` (`SetOffersAvailabilityCommand(goalkeeperId, available)`, result `{ outcome: 'updated'; availableForOffers: boolean; offersSent: number } | { outcome: 'not_a_goalkeeper' }`) and its handler:
  1. `setAvailableForOffers`; `null` → `not_a_goalkeeper`;
  2. log `offers_availability_changed`;
  3. if `available && previous === false`: `availableBookingsFor(goalkeeperId, now)`, and when `kind === 'ok'`, `offerSender.send(new Map([[goalkeeperId, bookings]]), now, 'catchUp')` and log `offers_catch_up`;
  4. `offersSent = report.entriesCreated`.

  Unit tests: off → no send; on from off → catch-up, and a second "on" sends nothing; not a goalkeeper; catch-up with nothing open → 0.
- [X] T019 [US4] Controller and profile:
  - `src/controllers/requests/goalkeepers/offersAvailabilityRequest.ts` (zod `{ available: z.boolean() }`);
  - in `goalkeeperController.ts`, `PUT /me/offers-availability` → `200 { availableForOffers, offersSent }`, and `not_a_goalkeeper` → the existing `goalkeeperNotFound()`. Place it with the other `/me/profile/*` routes and reuse the same middleware chain as the agenda routes;
  - in `goalkeeperRegistrationResponse.ts`, add `availableForOffers: boolean | null` (the profile's value when active, `null` otherwise), set wherever the active shape is built.

  Register the command in `di.ts` and `testAppFactory.ts`.
- [X] T020 [P] [US4] HTTP test `tests/http/controllers/offersAvailability.test.ts`:
  - `PUT … {available:false}` → `200 { availableForOffers: false, offersSent: 0 }`; `GET /api/goalkeepers/me` shows `false`;
  - the available list → `not_available_for_offers`;
  - a confirmation → no offer for G;
  - `PUT … {available:true}` → `offersSent: 1`, one push right away;
  - `RunSweepCommand` right after → no second push to G;
  - `{available:"yes"}` → 400;
  - a plain client → 404.

**Checkpoint**: SC-009.

---

## Phase 5: User Story 2 - Goalkeepers who haven't acted are reminded, with one push per round (Priority: P1)

**Goal**: A scheduled job reminds open offers: ≤ 1 push per goalkeeper per round, ≥ 5 minutes apart, ≤ 3 reminders per offer, including newly eligible goalkeepers.

**Independent Test**: Two unopened offers give 1 grouped push. After reading one, the next round describes the other. Rounds within 5 minutes send nothing. Five spaced rounds give exactly 3 reminders.

- [X] T021 [US2] Create `src/application/features/notifications/jobs/offerRemindersJob.ts`: `OfferRemindersJob implements IScheduledJob`, `name = 'offer-reminders'`, `leaseSeconds = 55`, with deps `{ bookingRepository, eligibility, offerSender, logger, roundCap }`. `run(now)`:
  1. `findOpenPending(now, roundCap)`; log `offer_round_cap_reached` at the cap;
  2. an empty result → return `'0 open bookings'`;
  3. `eligibleGoalkeepersFor(open, now)`, then `offerSender.send(map, now, 'round')`;
  4. log `offer_round { openBookings, ...report }`;
  5. return a short summary string.
- [X] T022 [US2] Register the job: in `src/infrastructure/di.ts`, `jobs: [offerRemindersJob]` in `RunSweepCommandHandler`; in `tests/http/testAppFactory.ts`, the same with fakes.
- [X] T023 [P] [US2] Unit tests `tests/unit/application/features/notifications/offerRemindersJob.test.ts` with fakes and a `FixedClock`:
  - 2 offers → 1 grouped push, and both `reminderCount` = 1;
  - a single offer → the match text;
  - a round at +2 min → nothing;
  - rounds at +5, +10, +15 and +20 min → exactly 3 reminders per offer, then none;
  - a read or dismissed offer → excluded;
  - a newly eligible goalkeeper (an offer created in the round) → pushed, counted as the first notification;
  - 2 concurrent `run(now)` → 1 push per goalkeeper;
  - a booking assigned in between → excluded;
  - run at 01:00 local → the same behavior (no quiet hours).
- [X] T024 [P] [US2] HTTP test in `tests/http/controllers/offersNotification.test.ts`:
  - after the first notification, `context.clock.advance(5 min)` then `RunSweepCommand` → G gets 1 reminder push;
  - `advance(1 min)` then a sweep → none;
  - two more spaced sweeps → 2 more; a fourth → none.

**Checkpoint**: SC-003 and SC-005.

---

## Phase 6: User Story 3 - Users read their inbox, mark it read and dismiss offers (Priority: P1)

**Goal**: `/api/notifications` lists, marks read, marks all read and dismisses, per the contract.

**Independent Test**:
- 3 offers → list 3, `unreadCount` 3.
- Read one → 2. Dismiss one → dismissed. Read all → 0.
- Another user → 404.
- A taken match → `stillAvailable: false`.

- [X] T025 [US3] Create `src/application/features/notifications/queries/listNotifications/` (`ListNotificationsQuery(userId, page, pageSize)`), returning `{ items, page, pageSize, totalItems, totalPages, unreadCount }`. Items per the contract. If the page has offers, call `eligibility.availableBookingsFor(userId, now)` once. `stillAvailable` = its request is among the returned bookings' requests (`false` when `kind !== 'ok'`). Non-offers → `null`.
- [X] T026 [US3] Create the commands `markNotificationRead` (outcome `read | not_found`), `markAllNotificationsRead` (`done`) and `dismissOffer` (`dismissed | not_found | not_an_offer`) under `src/application/features/notifications/commands/`. Add unit tests for all three plus the query (ownership, idempotency, `stillAvailable` true/false).
- [X] T027 [US3] Create `src/controllers/notificationsController.ts` (`requireAuth` only):
  - `GET /` (reuse the page/pageSize schema used by `/me/bookings`);
  - `POST /:id/read` → 204 / 404 `notification_not_found`;
  - `POST /read-all` → 204;
  - `POST /:id/dismiss` → 204 / 404 / 409 `not_an_offer`.

  Declare `/read-all` before `/:id/read`. Mount it at `/api/notifications` in `src/app.ts`. Register the handlers in `di.ts` and `testAppFactory.ts`.
- [X] T028 [P] [US3] HTTP test `tests/http/controllers/notifications.test.ts`:
  - seed 3 offers for G through real confirmations, or `context.notificationRepository` directly;
  - list: order, `unreadCount`, pagination, `pageSize=51` → 400;
  - read → `unreadCount` −1, and repeating is idempotent;
  - dismiss → `dismissedAt` set, then a round sends no reminder for it;
  - read-all → 0;
  - another user's id → 404, and a malformed id → 404;
  - after another goalkeeper accepts the match → `stillAvailable: false`;
  - an empty inbox → 200 with `[]`;
  - no bearer → 401.

**Checkpoint**: SC-006. The whole feature works end to end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 [P] `src/infrastructure/openapi/openapiSpec.ts`:
  - tag `Notifications` with the 4 inbox paths and a `NotificationItem` / `NotificationsPage` schema;
  - `PUT /api/goalkeepers/me/offers-availability`;
  - document `availableForOffers` on `GET /api/goalkeepers/me`, the new `unavailableReason` value and the new `409 goalkeeper_not_available` on accept.

  Assert the new paths exist in the HTTP tests.
- [X] T030 [P] `README.md`: rows for `OFFER_REMINDER_INTERVAL_MINUTES` and `OFFER_MAX_REMINDERS`. `docs/push-notifications.md`: add the `booking.available` and `bookings.available` routing (the match vs. the "available matches" list), and the rule that the app calls `POST /api/notifications/{id}/read` when opening an offer from the inbox or a push (it's what stops reminders).
- [X] T031 [P] Add "9. Ofertas a porteros (spec 015)" to `_temp_pruebas.md` (git-ignored, Spanish), from quickstart §1–§4, with steps, commands and expected results in the file's format.
- [X] T032 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T033 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §9): the real-device checks, and the reminder spacing observed against the dev cluster.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (must end green) → **US1** → **US4** → **US2** → **US3** → **Polish**.
- US4 changes 012's list and accept through the service built in T010. It comes before the reminders so rounds respect the switch from day one.
- US2 needs US1's wiring (T014).
- US3's "still available" needs T010.

### Parallel opportunities

- Phase 2: T002 ∥ T003 ∥ T004; then T005; then T006 ∥ T007 ∥ T008 ∥ T009; then T010; then T011.
- US1: T012, then T013, then T014, then T015.
- US4: T016 ∥ T017 ∥ T018; then T019; then T020.
- US2: T021, then T022, then T023 ∥ T024.
- US3: T025 ∥ T026; then T027; then T028.
- Polish: T029 ∥ T030 ∥ T031.

## Implementation Strategy

1. Phase 1–2: the shared core, green.
2. US1: the MVP. Goalkeepers learn about new matches instantly.
3. US4: the switch, and 012 gated by it.
4. US2: reminders with the cap.
5. US3 + Polish: the inbox, OpenAPI, docs and the manual checks list.

## Notes

- **One predicate** (`isEligible`) serves both directions. Never re-implement a rule in a query.
- **Only the inserter pushes on the first notification.** Rounds push only after an atomic claim.
- **A grouped push counts as one reminder per covered offer.** The switch never resets counts.
- **No new npm dependency.**
