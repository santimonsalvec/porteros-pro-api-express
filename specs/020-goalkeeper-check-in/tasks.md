---

description: "Task list for Goalkeeper Check-in with Photo"
---

# Tasks: Goalkeeper Check-in with Photo

**Input**: Design documents from `/specs/020-goalkeeper-check-in/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/check-in.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- the lifecycle store on mocked collections;
- unit tests reusing `tests/unit/application/features/bookingLifecycle/lifecycleHarness.ts` (`match`, `acceptAndPay`, `assign`, `withdraw`, `users`, notifications, push sender);
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })`, `signInClient`, `signInGoalkeeper`, `createRequestAsClient`, `ownerOf`, `MATCH_NOW` and `TEST_INTERNAL_TOKEN`. With `startsAt` 17:00 local the match is at 22:00Z: the window runs 21:30Z–22:15Z and the last call is at 22:05Z.
- no real resources.

**Organization**:
- Phase 2 prepares everything shared: the domain, the settings, the event, the messages, the store transaction, the repository methods and the fakes.
- Then the stories:
  - **US1**: the check-in endpoint;
  - **US2**: the client views and the "arrived" notice;
  - **US3**: the "no check-in" notice;
  - **US4**: the reminders.

  US3 and US4 share one sweep job, built in US3 and extended in US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 No new dependency or environment variable: the window values live in `bookingSettings` (country), with code defaults.

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

- [X] T002 [P] `src/domain/bookings/checkInWindow.ts` (new):
  - `CHECK_IN_DEFAULTS = { opensMinutesBefore: 30, closesMinutesAfter: 15 }`;
  - `LAST_CALL_MINUTES_BEFORE_CLOSE = 10`;
  - `checkInWindow(startsAt, config) → { opensAt, lastCallAt, closesAt }`, where `lastCallAt = max(opensAt, closesAt − 10 min)`;
  - `isCheckInOpen(window, now)`, inclusive at both ends;
  - `distanceMeters(a: {latitude, longitude}, b)`: haversine with R = 6 371 000, rounded.

  Tests in `tests/unit/domain/bookings/checkInWindow.test.ts`:
  - both boundaries (inclusive), and 1 ms outside;
  - the last call for the default and for a 5-minute window;
  - a known distance, for example two Cali points about 1.1 km apart, within 1%;
  - 0 for the same point.
- [X] T003 [P] `src/domain/bookings/booking.ts`:
  - props and readonly fields `checkIn: CheckIn | null`, `checkInOpenNoticeAt`, `checkInLastCallAt` and `checkInMissedAt` (all default `null`);
  - `CheckIn = { at: Date; imageId: string; photoUrl: string; location: { latitude; longitude; accuracyMeters: number | null } | null; distanceMeters: number | null }`, exported.

  Map the four fields in `src/infrastructure/persistence/mongo/bookingRepository.ts` (absent → `null`), and add the index `status_startsAt` `{ status: 1, startsAt: 1 }` to `ensureIndexes`. Update the expected document in `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts`.
- [X] T004 [P] `src/domain/pricing/bookingSettings.ts`: optional `checkInWindow: Partial<{ opensMinutesBefore; closesMinutesAfter }> | null`, validated as integers in 1–120 and 1–60 respectively, else `InvalidConfigurationError`. Map it in `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts`. Extend the settings domain and repository tests.
- [X] T005 [P] Events:
  - `src/domain/events/domainEvent.ts` adds `'goalkeeper.checked_in'`;
  - `src/domain/events/bookingEvents.ts` adds `GoalkeeperCheckedInPayload { goalkeeperId, clientId, zoneId, startsAt, checkedInAt, distanceMeters }` and the factory `goalkeeperCheckedIn(id, booking, at)` (the booking must have `checkIn`);
  - the zod schema in `src/application/features/events/common/eventSchemas.ts`;
  - `DELIVERY_LOG_EVENT_TYPES` in `src/application/features/events/handlers/logEventDelivery.ts`.

  Extend the event tests.
- [X] T006 [P] `src/domain/notifications/checkInMessages.ts` (new), per research §7:
  - `goalkeeperArrivedMessage(match, requestId, bookingId)`;
  - `checkInMissedMessage(match, requestId, bookingId, contact: PersonContact | null)` (reusing `PersonContact` from `assignmentMessages.ts`);
  - `checkInOpenMessage(match, requestId, bookingId)`;
  - `checkInLastCallMessage(match, requestId, bookingId)`.

  Types: `booking.goalkeeper_arrived`, `booking.check_in_missed`, `booking.check_in_open` and `booking.check_in_last_call`. Tests in `tests/unit/domain/notifications/checkInMessages.test.ts`: exact texts, no double period or NBSP, a valid push, and a missing name or WhatsApp.
- [X] T007 `src/application/features/bookingLifecycle/common/checkInWindowResolver.ts` (new): `createCheckInWindowResolver(deps: { cityRepository; regionRepository; countryLookup? ; bookingSettingsRepository; logger })`, returning `(request) => Promise<{ opensMinutesBefore; closesMinutesAfter }>`.
  - It resolves the request's city → region → country (country id only), then `findFor(cityId, countryId).country?.checkInWindow`, merged over the defaults.
  - It warns `check_in_window_defaulted` with the missing fields, and caches per city for the resolver's lifetime (callers create one per run or per request).

  Tests in `tests/unit/application/features/bookingLifecycle/checkInWindowResolver.test.ts`: full, partial and absent config, an unresolvable country, and caching.
- [X] T008 Store:
  - **Ports**, in `src/application/features/bookingLifecycle/common/ports.ts`: `CheckInResult` (data-model.md) and `IBookingLifecycleStore.checkIn(args: { bookingId; goalkeeperId; now; window: { opensAt; closesAt }; checkIn: Omit<CheckIn, 'at'>; buildEvents: (booking: Booking) => DomainEvent[] }): Promise<CheckInResult>`.
  - **Mongo**, in `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`, per research §3:
    1. read the booking: missing or another goalkeeper → `not_found`; an existing `checkIn` of this goalkeeper → `replayed`; not assigned → `not_assigned`;
    2. window checks: `too_early` / `too_late`;
    3. the conditional update `{ _id, status: 'assigned', goalkeeperId, checkIn: null }` with `$set: { checkIn: { at: now, ...checkIn } }`;
    4. `appendEventsInSession`.

    Refusals write nothing.
  - **Fake**, in `tests/fakes/fakeBookingLifecycleStore.ts`: the same, synchronously.

  Mongo tests in `bookingLifecycleStore.test.ts`: the happy path (update and event), a replay after close, each refusal without writes.
- [X] T009 Repository:
  - `IBookingRepository` (`src/application/features/goalkeeperRequests/common/ports.ts`) gains `findForCheckInWatch(now, cap)`: `{ status: 'assigned', startsAt: { $gt: now − 60 min, $lte: now + 120 min } }`, sorted by `startsAt, _id`, with a limit;
  - `markCheckInNotice(bookingId, field: 'checkInOpenNoticeAt' | 'checkInLastCallAt' | 'checkInMissedAt', now): Promise<boolean>`: a conditional `updateOne` on `{ _id, [field]: null }`.

  Implement both in `src/infrastructure/persistence/mongo/bookingRepository.ts` and `tests/fakes/fakeBookingRepository.ts`. Query tests in `tests/unit/infrastructure/persistence/mongo/offerQueries.test.ts`.
- [X] T010 [P] Audit: `IBookingAuditLogger.logCheckIn({ outcome, goalkeeperId, bookingId, requestId? })` in `src/application/features/goalkeeperRequests/common/ports.ts`, `src/infrastructure/observability/pinoAuditLogger.ts` and `tests/fakes/fakeBookingAuditLogger.ts` (`checkIns` array).

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - The goalkeeper checks in at the pitch with a photo (Priority: P1) 🎯 MVP

**Goal**: A check-in inside the window, once, with the location as non-blocking evidence.

**Independent Test**: An assigned goalkeeper checks in 10 minutes before the start with a photo and a location → recorded with the distance. A repeat is the same. Outside the window, or not theirs, it's refused.

- [X] T011 [US1] `src/application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommand.ts`:
  - `CheckInToBookingCommand(goalkeeperId, bookingId, imageId, location?: { latitude; longitude; accuracyMeters?: number })`;
  - result: `{ outcome: 'checked_in' | 'replayed'; booking: AgendaItem }` | `{ outcome: 'not_a_goalkeeper' | 'booking_not_found' | 'invalid_photo' }` | `{ outcome: 'not_assigned'; status }` | `{ outcome: 'too_early'; opensAt: string }` | `{ outcome: 'too_late'; closedAt: string }`.

  The handler, in `…Handler.ts`, has deps `{ goalkeeperProfileRepository, imageRepository, bookingRepository, requestRepository, zoneRepository, cityRepository, userRepository, windowResolver: (request) => Promise<config>, store, relay, idGenerator, clock, audit }`:
  1. check the profile;
  2. load the booking, where missing or not theirs → `booking_not_found`;
  3. load the image, where missing or `uploadedBy !== goalkeeperId` → `invalid_photo`;
  4. load the request and compute the window;
  5. compute `distanceMeters` to `request.match` when there's a location;
  6. `store.checkIn` with `buildEvents: (b) => [goalkeeperCheckedIn(newId(), b, now)]`;
  7. relay on `checked_in`;
  8. answer with `toAgendaItem` (with `loadContacts` for the client, and `now`);
  9. audit every outcome.
- [X] T012 [US1] `src/application/features/goalkeeperRequests/common/goalkeeperBookingResponse.ts`: `AgendaItem.checkIn: { at: string; photoUrl: string; distanceMeters: number | null } | null`, from `booking.checkIn`.
- [X] T013 [US1] Endpoint `POST /me/bookings/:bookingId/check-in` in `src/controllers/goalkeeperController.ts`:
  - body zod `checkInRequestSchema`, in `src/controllers/requests/checkIn/checkInRequest.ts`: `imageId` a non-empty string; `location` optional, with `latitude` in −90..90, `longitude` in −180..180 and `accuracyMeters` ≥ 0 optional;
  - an exhaustive mapping per contracts §2.

  Register the command, with a resolver created per request from `createCheckInWindowResolver`, in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`. Add the command to `lifecycleHarness` (`checkIn(bookingId, goalkeeperId, imageId, location?)`, plus a helper that seeds an image uploaded by a user, `photo(userId)`).
- [X] T014 [P] [US1] Unit tests in `tests/unit/application/features/bookingLifecycle/checkInToBooking.test.ts`:
  - 10 minutes before → `checked_in`, the booking's `checkIn` with the photo URL, the location and the distance, and 1 `goalkeeper.checked_in` event;
  - without a location → `checked_in` with `location: null, distanceMeters: null`;
  - far away (≈ 5 km) → still `checked_in`, with the distance;
  - a repeat → `replayed`, with no new event, even after the window closed;
  - start − 31 → `too_early` with `opensAt`; start + 16 → `too_late` with `closedAt`; exactly start − 30 and start + 15 → accepted;
  - another goalkeeper's booking → `booking_not_found`; a withdrawn booking → `booking_not_found` (the goalkeeper no longer holds it) or `not_assigned`, per the fake's rule;
  - an image uploaded by someone else, or missing → `invalid_photo`;
  - country settings with `closesMinutesAfter: 5` → start + 6 → `too_late`.
- [X] T015 [P] [US1] HTTP `tests/http/controllers/goalkeeperCheckIn.test.ts`:
  - G uploads with `POST /api/images` (a tiny valid PNG buffer, as in the images tests) and accepts a 22:00Z match at `MATCH_NOW`;
  - clock 21:45Z → the check-in → `200` with `checkIn.photoUrl` and `distanceMeters`;
  - a repeat → `200`;
  - 21:29Z → `409 check_in_not_open`; 22:16Z → `409 check_in_closed`;
  - another user's image → `400 invalid_photo`;
  - bad coordinates → `400`;
  - a client token → `404 goalkeeper_not_found`.

**Checkpoint**: SC-002 and SC-005 (check-ins).

---

## Phase 4: User Story 2 - The client sees that their goalkeeper arrived (Priority: P1)

**Goal**: The client's views show the time and the photo (no location), and the client gets one "arrived" notice.

**Independent Test**: After a check-in, the client's request shows `checkIn { at, photoUrl }`, and the inbox has one `booking.goalkeeper_arrived`.

- [X] T016 [US2] `src/application/features/goalkeeperRequests/common/requestResponse.ts`: `BookingItemResponse.checkIn: { at: string; photoUrl: string } | null`, with no location or distance. Unit test in the requestResponse tests.
- [X] T017 [US2] `src/application/features/bookingLifecycle/handlers/checkInNoticeHandler.ts` (new), a consumer of `goalkeeper.checked_in` (`runOnce`, name `check-in-notices`): it loads the request and the match names, then `notifyOnce` to the client with `goalkeeperArrivedMessage` and key `goalkeeper-arrived:{bookingId}`. Register it in `src/infrastructure/di.ts`, `tests/http/testAppFactory.ts` and `lifecycleHarness` (`checkInNotices`).
- [X] T018 [P] [US2] Tests:
  - unit in `checkInToBooking.test.ts` (notices section): the relayed event → 1 `booking.goalkeeper_arrived` to the client, and a redelivery → still 1;
  - HTTP in `goalkeeperCheckIn.test.ts`: after the check-in, the client's `GET /api/goalkeeper-requests/bookings` shows `checkIn: { at, photoUrl }` and no `distanceMeters` or `location` anywhere in the body; the client's inbox has `booking.goalkeeper_arrived`.

**Checkpoint**: SC-003 and FR-006.

---

## Phase 5: User Story 3 - The client is told when the goalkeeper hasn't checked in (Priority: P1)

**Goal**: At the window close, one notice to the client with the goalkeeper's WhatsApp, the `checkInMissedAt` mark, exactly once, and never after the end.

**Independent Test**: No check-in → at start + 15 the client gets 1 notice with the WhatsApp; with a check-in → none.

- [X] T019 [US3] `src/application/features/bookingLifecycle/jobs/checkInWatchJob.ts` (new, `IScheduledJob`, name `check-in-watch`, `leaseSeconds = 55`, `cap = 500`): `run(now)` does `findForCheckInWatch`, creates one window resolver per run, and per booking:
  - `now > closesAt && now < endsAt && !checkIn && !checkInMissedAt` → load the request, the names and the goalkeeper's contact → `notifyOnce(client, checkInMissedMessage, 'check-in-missed:{id}')` → `markCheckInNotice(id, 'checkInMissedAt', now)`.

  One booking failing is logged and doesn't stop the others. It returns a summary such as `'0 opened, 0 last calls, 1 missed, 0 failed'`. Register it last in the sweep `jobs` in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`, and add it to `lifecycleHarness` (`checkInWatchJob`). Update `tests/http/controllers/internalEvents.test.ts` (sweep report).
- [X] T020 [P] [US3] Unit tests in `tests/unit/application/features/bookingLifecycle/checkInWatch.test.ts` (missed section):
  - an assigned booking without a check-in: at start + 14 → nothing; at start + 16 → 1 `booking.check_in_missed` to the client with "WhatsApp +57 …", and `checkInMissedAt` set; a second run → nothing new;
  - a checked-in booking → nothing;
  - after `endsAt` → nothing;
  - a 2-goalkeeper request with one checked in → only the other one is notified;
  - a failure on one booking → the others are processed.
- [X] T021 [P] [US3] HTTP in `goalkeeperCheckIn.test.ts`: G accepts a 22:00Z match without checking in; clock 22:16Z; `POST /internal/sweep` twice → the client's inbox has exactly 1 `booking.check_in_missed` whose body has G's WhatsApp.

**Checkpoint**: SC-004.

---

## Phase 6: User Story 4 - The goalkeeper is reminded to check in (Priority: P2)

**Goal**: The "window open" reminder and the "10 minutes left" reminder (only without a check-in), each at most once, and none once closed.

**Independent Test**: An assigned booking → 1 reminder at start − 30. Without a check-in → 1 more at start + 5. With a check-in before that → no second one.

- [X] T022 [US4] Extend `checkInWatchJob.ts`, before the missed rule:
  - `isCheckInOpen && !checkInOpenNoticeAt` → `notifyOnce(goalkeeper, checkInOpenMessage, 'check-in-open:{id}')` → mark `checkInOpenNoticeAt`;
  - `now ≥ lastCallAt && now ≤ closesAt && !checkIn && !checkInLastCallAt` → `notifyOnce(goalkeeper, checkInLastCallMessage, 'check-in-last-call:{id}')` → mark `checkInLastCallAt`.

  Both are counted in the summary.
- [X] T023 [P] [US4] Unit tests in `checkInWatch.test.ts` (reminders section):
  - start − 31 → nothing; start − 30 → 1 `booking.check_in_open` to the goalkeeper; start − 29 → nothing new;
  - start + 5 without a check-in → 1 `booking.check_in_last_call`;
  - with a check-in at start − 10 → no last call;
  - a booking assigned at start − 10 (a replacement) → the "open" reminder on the next run;
  - after the close → neither reminder (only the missed notice);
  - a withdrawn booking → nothing.
- [X] T024 [P] [US4] HTTP in `goalkeeperCheckIn.test.ts`: clock 21:30Z with a sweep → G's inbox has `booking.check_in_open`; clock 22:05Z with a sweep → `booking.check_in_last_call`; a second sweep → no duplicates.

**Checkpoint**: SC-006.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 [P] `src/infrastructure/openapi/openapiSpec.ts`: the check-in path (body, responses, security), `checkIn` on `BookingItemResponse` and `AgendaItem`. `docs/push-notifications.md`: the 4 types and the check-in flow (upload, then check in). Assert the path in the HTTP tests.
- [X] T026 [P] Add "14. Check-in del portero (spec 020)" to `_temp_pruebas.md` from quickstart §1–§5, in Spanish.
- [X] T027 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure, including the 015–019 tests whose expectations change (booking documents, sweep report, inbox counts).
- [ ] T028 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §14).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** → **US4** → **Polish**.
- US2 needs US1's event. US3 and US4 share the job (T019 → T022).

### Parallel opportunities

- **Phase 2**:
  1. T002 ∥ T003 ∥ T004 ∥ T005 ∥ T006 ∥ T010;
  2. then T007;
  3. then T008 ∥ T009.
- **US1**:
  1. T011 ∥ T012;
  2. then T013;
  3. then T014 ∥ T015.
- **US2**: T016 ∥ T017, then T018.
- **US3**: T019, then T020 ∥ T021.
- **US4**: T022, then T023 ∥ T024.
- **Polish**: T025 ∥ T026.

## Implementation Strategy

1. **Phase 1–2**: domain, settings, events, messages, store and queries.
2. **US1**: the check-in (the MVP: proof of attendance).
3. **US2**: the client sees it.
4. **US3**: the "no check-in" notice (and the fact 021 needs).
5. **US4**: the reminders.
6. **Polish**.

## Notes

- **The platform clock decides the window**, inclusive at both ends. Nothing is accepted after the close (clarification 1).
- **The location never blocks, and never reaches the client** (clarification 3).
- **Notices before marks** in the job, each idempotent by its dedupe key.
