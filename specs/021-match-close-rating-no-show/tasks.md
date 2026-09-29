---

description: "Task list for Match Close, Minimal Rating and No-shows"
---

# Tasks: Match Close, Minimal Rating and No-shows

**Input**: Design documents from `/specs/021-match-close-rating-no-show/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ratings-and-cases.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- the stores and repositories tested on mocked collections;
- unit tests reusing `tests/unit/application/features/bookingLifecycle/lifecycleHarness.ts` (`match`, `acceptAndPay`, `checkIn`, `photo`, `withdraw`, `users`, `store.incidents()`, `goalkeeperProfileRepository`, notifications);
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })`, `signInClient`, `signInGoalkeeper`, `signInAdmin`, `createRequestAsClient`, `ownerOf`, `MATCH_NOW` and `TEST_INTERNAL_TOKEN`. With `startsAt` 17:00 local and 90 minutes, the match runs 22:00Z–23:30Z and the no-show deadline is 00:30Z.
- no real resources.

**Organization**:
- Phase 2 builds:
  - the domain (booking fields, `Rating`, `Case`, rating window, no-show kind, settings, events, messages);
  - the generic country resolver;
  - 018's shared incident helper;
  - the new repositories and fakes.
- Then the stories:
  - **US1**: completion;
  - **US2**: ratings;
  - **US3**: no-shows (the sweep, plus the rating consequences that record them);
  - **US4**: cases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 No new dependency or environment variable: the grace period lives in `bookingSettings` (country), with the default 60.

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

- [X] T002 [P] `src/domain/bookings/booking.ts`:
  - props and readonly fields `completedAt: Date | null`, `attendance: 'attended' | 'no_show' | null` and `noShowAt: Date | null` (default `null`);
  - `BookingAttendance` exported.

  Map them in `src/infrastructure/persistence/mongo/bookingRepository.ts` (absent → `null`), and add the indexes `status_endsAt` `{ status: 1, endsAt: 1 }` and `client_endsAt` `{ clientId: 1, endsAt: -1 }`. Update the document expectation in `bookingRepository.test.ts`.
- [X] T003 [P] `src/domain/ratings/rating.ts` (new):
  - `RatingSide = 'client' | 'goalkeeper'`;
  - `Rating` entity `{ id, bookingId, requestId, side, authorId, subjectId, answer: boolean, stars, comment, createdAt }`. Stars must be an integer 1–5; the comment is trimmed, empty → `null`, and over 500 characters throws;
  - `RATING_DAYS = 7`;
  - `ratingWindowFor(booking, side, now)` → `{ ok: true; dueUntil } | { ok: false; reason: 'not_finished' | 'expired' | 'no_goalkeeper' }`, per research §2.

  Tests in `tests/unit/domain/ratings/rating.test.ts`: every reason and each side's opening condition (client with a check-in before the end; goalkeeper only once completed).
- [X] T004 [P] `src/domain/cases/case.ts` (new):
  - `CaseType = 'goalkeeper_no_show' | 'payment_not_received' | 'late_attendance_claim'`;
  - the `SupportCase` entity (fields per data-model.md), with `resolve({ by, at, note })`. The note is trimmed to 3–500 characters, else it throws; resolving an already resolved case throws.

  Tests in `tests/unit/domain/cases/case.test.ts`.
- [X] T005 [P] Settings and incident kind:
  - `src/domain/pricing/bookingSettings.ts` gains `noShowGraceMinutes` (integer 15–240, else `InvalidConfigurationError`), mapped in `bookingSettingsRepository.ts`;
  - `src/domain/goalkeepers/goalkeeperIncident.ts`: `IncidentKind = 'withdrawal' | 'no_show'`.

  Extend the settings tests.
- [X] T006 [P] Events: `booking.completed` and `goalkeeper.no_show`.
  - Types in `src/domain/events/domainEvent.ts`; payloads and factories `bookingCompleted(id, booking, at)` and `goalkeeperNoShow(id, booking, incident, suspendedUntil, at)` in `src/domain/events/bookingEvents.ts`.
  - The zod schemas in `eventSchemas.ts`, and `DELIVERY_LOG_EVENT_TYPES`.

  Extend the event tests.
- [X] T007 [P] `src/domain/notifications/noShowMessages.ts` (new): `NO_SHOW_TYPE = 'goalkeeper.no_show'` and `noShowMessage(match, requestId, bookingId, suspendedUntil: Date | null, timeZone)`. The body is "No confirmaste tu llegada al partido en … y quedó registrado como inasistencia." plus " Quedaste suspendido hasta el {localWhen}." when suspended. Tests in `tests/unit/domain/notifications/noShowMessages.test.ts`: the text, no double period, a valid push.
- [X] T008 `src/application/features/bookingLifecycle/common/countrySettingsResolver.ts` (new): `createCountrySettingsResolver({ cityRepository, regionRepository, bookingSettingsRepository })` → `(cityId) => Promise<BookingSettings | null>` (the country document, cached per city).
  - Rewrite `createCheckInWindowResolver` (020) on top of it, with the same behavior and tests.
  - Add `createNoShowGraceResolver(deps)` → `(request) => Promise<number>` (default 60, warning `no_show_grace_defaulted`).

  Tests in `tests/unit/application/features/bookingLifecycle/checkInWindowResolver.test.ts` (unchanged, still green) and a new `noShowGraceResolver.test.ts`.
- [X] T009 018 refactor in `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`: extract from `withdraw` a private `recordIncidentInSession(session, { kind, booking, goalkeeperId, now, late, noticeMinutes, reason, replacementBookingId, config, newId })`. It returns `{ incident, suspendedUntil }`: it counts the window, applies `penaltiesFor`, inserts the incident and writes the suspension. `withdraw` uses it with unchanged behavior. Do the same in `tests/fakes/fakeBookingLifecycleStore.ts`. The 018 tests must stay green.
- [X] T010 [P] Repositories and ports:
  - `src/application/features/ratings/common/ports.ts` (new): `IRatingRepository { findByBookingsAndSide(bookingIds, side): Promise<Rating[]>; ensureIndexes? }`;
  - `src/infrastructure/persistence/mongo/ratingRepository.ts`: `RATINGS_COLLECTION`, `ratingToDocument` / `ratingFromDocument`, and the indexes `booking_side_unique` (unique) and `author_created`;
  - `src/application/features/cases/common/ports.ts` (new): `ICaseRepository { list(status: CaseStatus | null, skip, limit); count(status | null); getById(id); resolve(id, decision): Promise<'resolved' | 'already_resolved' | 'not_found'> }`;
  - `src/infrastructure/persistence/mongo/caseRepository.ts`: `CASES_COLLECTION`, the mapping, and the indexes `booking_type_unique` (unique) and `status_created`. `list` sorts by status asc (open first), then `createdAt` desc; `resolve` is a conditional `updateOne` on `status: 'open'`.
  - The fakes `tests/fakes/fakeRatingRepository.ts` and `tests/fakes/fakeCaseRepository.ts` share in-memory arrays with the fake lifecycle store: the store writes, the repositories read.
  - Register `ensureIndexes` in `src/infrastructure/di.ts`.

  Mocked-collection tests for both repositories.
- [X] T011 [P] Audit: `IBookingAuditLogger` gains `logRating({ outcome, userId, bookingId, side? })` and `logCaseResolution({ outcome, adminId, caseId })`. Implement them in `pinoAuditLogger.ts` and `fakeBookingAuditLogger.ts`.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - The match closes on its own (Priority: P1) 🎯 MVP

**Goal**: Assigned bookings are completed at their end, exactly once, and checked-in ones are marked attended.

**Independent Test**: An assigned booking past its end → completed within one run, and a second run changes nothing. Other statuses are untouched.

- [X] T012 [US1] `IBookingLifecycleStore.complete(requestId, now, buildEvents: (completed: Booking[]) => DomainEvent[]): Promise<{ completed: Booking[]; events }>`, in the ports, the Mongo store and the fake:
  1. read the `assigned` bookings with `endsAt ≤ now`;
  2. `updateMany` them to `status: 'completed', completedAt: now`, and those with a `checkIn` also get `attendance: 'attended'` (two updates, or per booking);
  3. append the events;
  4. `deactivateIfEnded`.

  Nothing due → empty. Mongo tests in `bookingLifecycleStore.test.ts`.
- [X] T013 [US1] `IBookingRepository.findDueForCompletion(now, cap)` (`{ status: 'assigned', endsAt: { $lte: now } }`, sorted by `endsAt, _id`), in Mongo and the fake. `src/application/features/bookingLifecycle/jobs/bookingCompletionJob.ts` (new, `booking-completion`) groups by request, calls `store.complete` with `bookingCompleted` events, and relays. One request failing doesn't stop the others. It returns `'N bookings completed in M requests, F failed'`. Register it after `booking-expiry` in the sweep jobs (`src/infrastructure/di.ts`, `tests/http/testAppFactory.ts`) and in `lifecycleHarness` (`completionJob`). Update the sweep report expectation in `tests/http/controllers/internalEvents.test.ts`.
- [X] T014 [P] [US1] Unit tests `tests/unit/application/features/bookingLifecycle/bookingCompletion.test.ts`:
  - assigned at `endsAt − 1 min` → untouched; at `endsAt` → completed, with `completedAt`, and 1 `booking.completed`;
  - checked in → `attendance: 'attended'`;
  - a second run → nothing;
  - cancelled, expired and withdrawn bookings → untouched;
  - the request becomes inactive, and its status is `completed`.
- [X] T015 [P] [US1] HTTP `tests/http/controllers/matchClose.test.ts`: G accepts a 22:00Z match; clock 23:30Z; sweep → the client's request `status: 'completed'`, and G's agenda item `status: 'completed'`.

**Checkpoint**: SC-001.

---

## Phase 4: User Story 2 - Client and goalkeeper rate each other (Priority: P1)

**Goal**: One private rating per side and booking, inside the window, and a pending list.

**Independent Test**: After a completed booking, both sides have one pending rating. Each rates once, and a repeat is refused.

- [X] T016 [US2] `IBookingLifecycleStore.rate(args: { bookingId; userId; now; answer; stars; comment; newId; noShowConfig: GoalkeeperPenaltyConfig; buildEvents })`, returning `RateResult`: `{ kind: 'rated'; rating; caseOpened: CaseType | null; noShow: boolean; events }` | `{ kind: 'not_found' }` | `{ kind: 'not_rateable'; reason }` | `{ kind: 'already_rated' }`.

  Mongo, one transaction, per research §3:
  1. read the booking; infer the side (client → `client`, the booking's goalkeeper → `goalkeeper`, else `not_found`); check `ratingWindowFor`;
  2. insert the rating (a duplicate key → `already_rated`);
  3. apply the consequences of the table.

  **In this task**, implement only these rows:
  - client "yes" without a check-in → `attendance: 'attended'` (conditional on `attendance: null`);
  - client "yes" with a check-in, and goalkeeper "yes" → nothing.

  **The no-show and case rows come in US3 and US4.** The fake store does the same. Mongo tests for the implemented rows and for each refusal.
- [X] T017 [US2] `src/application/features/ratings/commands/rateBooking/` (new): `RateBookingCommand(userId, bookingId, answer, stars, comment?)`.
  - The result: `{ outcome: 'rated'; rating: RatingResponse }` | `{ outcome: 'booking_not_found' | 'already_rated' | 'invalid_rating' }` | `{ outcome: 'not_rateable'; reason }`.
  - The handler validates the domain (`invalid_rating`), resolves the penalty config (018's `resolvePenaltyConfig`, for the no-show rows), calls `store.rate` with `goalkeeperNoShow` events, relays, and audits `logRating`.
- [X] T018 [US2] `IBookingRepository.findRateable(userId, now)`, returning `{ asClient: Booking[]; asGoalkeeper: Booking[] }`:
  - `asClient`: `clientId = userId` and `endsAt ≥ now − 7 d`, with status `completed` or (`assigned` with a `checkIn`);
  - `asGoalkeeper`: `goalkeeperId = userId`, `status: 'completed'` and `endsAt ≥ now − 7 d`.

  It's in Mongo and the fake. Then `src/application/features/ratings/queries/listPendingRatings/`, the `ListPendingRatingsQuery(userId)` handler:
  - removes those already rated by that side (`ratingRepository.findByBookingsAndSide`);
  - builds items with `loadBookingItemContext` (the names) and `loadContacts` for the other party (name only: `firstName`, `lastName`);
  - adds `question` and `dueUntil`;
  - sorts by `startsAt` desc.
- [X] T019 [US2] `src/controllers/ratingsController.ts` (new, `/api/ratings`, `requireAuth` + `requireCompleteProfile`):
  - `GET /pending`;
  - `POST /bookings/:bookingId`, with the zod body in `src/controllers/requests/ratings/rateRequest.ts` (`answer` boolean, `stars` int 1–5, `comment` string ≤ 500 optional), mapped exhaustively per contracts §1–§2.

  Mount it in `src/app.ts`. Register the command, the query and the repositories in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`. Add `rate(bookingId, userId, answer, stars, comment?)` and `pending(userId)` to `lifecycleHarness`.
- [X] T020 [P] [US2] Unit tests `tests/unit/application/features/ratings/rateBooking.test.ts`:
  - a completed booking: the client rates "yes" 5★ → `rated`, the rating stored, `attendance: 'attended'`;
  - the goalkeeper rates "yes" → `rated`;
  - a repeat by the same side → `already_rated`;
  - a stranger → `booking_not_found`;
  - before the end without a check-in → `not_rateable/not_finished`; before the end with a check-in, the client → `rated`, and the goalkeeper → `not_finished`;
  - after 7 days → `expired`;
  - a withdrawn booking → `not_rateable/no_goalkeeper` for the original goalkeeper, or `booking_not_found`;
  - 6 stars or a 501-character comment → `invalid_rating`;
  - the pending list: both sides listed, then empty after rating, and expired items dropped.
- [X] T021 [P] [US2] HTTP `tests/http/controllers/ratings.test.ts`: close a match (as in T015); the client's and G's `GET /api/ratings/pending` each list it; both rate → `201`; a repeat → `409 already_rated`; a bad body → `400`; another user → `404`.

**Checkpoint**: SC-002 and FR-003–FR-006.

---

## Phase 5: User Story 3 - No-shows are detected and penalized (Priority: P1)

**Goal**: A no-show at end + grace without a check-in or a "yes", or at once on a client's "no" without a check-in. It applies 018's policy, is notified, and is reversible.

**Independent Test**: No check-in and no rating → at end + 60 min a no-show with a 3-day suspension, in the goalkeeper's history. A check-in or a "yes" → none.

- [X] T022 [US3] `IBookingLifecycleStore.settleAttendance({ bookingId, now, config, newId, buildEvents })` → `{ kind: 'no_show'; incident; suspendedUntil; events }` | `{ kind: 'attended' }` | `{ kind: 'skipped' }`. In Mongo and the fake, one transaction:
  1. re-read the booking, requiring `status: 'completed'`, `attendance: null` and no check-in, else `skipped`;
  2. read the client's rating: a "yes" → set `attended`;
  3. otherwise `recordIncidentInSession({ kind: 'no_show', late: true, noticeMinutes: 0, … })`, set `attendance: 'no_show', noShowAt: now`, and append the events.

  Mongo tests.
- [X] T023 [US3] In `store.rate` (T016), the client "no" without a check-in row: record the no-show in the same transaction (the same helper, attendance `no_show`) when the booking isn't a no-show yet. Covered in the rating table tests.
- [X] T024 [US3] `IBookingRepository.findDueForAttendance(now, cap)` (`{ status: 'completed', attendance: null, endsAt: { $lte: now − 15 min } }`). `src/application/features/bookingLifecycle/jobs/noShowWatchJob.ts` (new, `no-show-watch`), per research §5:
  - one grace resolver and one penalty-config lookup per goalkeeper per run;
  - skip while `now < endsAt + grace`;
  - `settleAttendance`, then relay the events.

  It returns `'N no-shows, A attended, F failed'`. Register it after `booking-completion` (DI, test factory, harness `noShowJob`). Update the sweep report expectation.
- [X] T025 [US3] `src/application/features/bookingLifecycle/handlers/noShowNoticeHandler.ts` (new), a consumer of `goalkeeper.no_show`: `notifyOnce` to the goalkeeper with `noShowMessage`, key `no-show:{bookingId}`. Register it in DI, the test factory and the harness.
- [X] T026 [US3] 018's history: in `src/application/features/bookingLifecycle/common/withdrawalResponses.ts`, `WithdrawalItem` gains `kind`. Update the 018 tests' expectations and the OpenAPI `WithdrawalItem`.
- [X] T027 [P] [US3] Unit tests `tests/unit/application/features/bookingLifecycle/noShows.test.ts`:
  - completed without a check-in: at end + 59 → nothing; at end + 60 → a no-show, with a `no_show` incident with a 3-day `late` penalty, the profile suspended, 1 `goalkeeper.no_show` notice, and `attendance: 'no_show'`;
  - a second run → nothing;
  - checked in → never;
  - the client's "yes" at end + 30 → attended, and no no-show at end + 60;
  - the client's "no" without a check-in at end + 10 → an immediate no-show;
  - the weekly count: two withdrawals and then a no-show within 7 days → the `weekly_limit` penalty too;
  - 018's reversal of the no-show incident → the suspension lifted, and it's forgiven;
  - country grace 30 → a no-show at end + 30;
  - **a race**: a late "yes" and the sweep through the fake → exactly one outcome.
- [X] T028 [P] [US3] HTTP in `tests/http/controllers/matchClose.test.ts` (no-shows): G accepts; no check-in; clock 00:30Z (next day); sweep → G's available matches say `suspended`, G's inbox has `goalkeeper.no_show`, and `GET /api/goalkeepers/me/withdrawals` has an item with `kind: 'no_show'`.

**Checkpoint**: SC-003 and FR-007–FR-010.

---

## Phase 6: User Story 4 - Disputes open a case for manual review (Priority: P2)

**Goal**: Cases for the "no" answers and late claims; admins list, view and resolve them.

**Independent Test**: The client's "no" → one open case; an admin resolves it with a note → resolved, and a repeat is refused.

- [X] T029 [US4] In `store.rate` (T016), the case rows. Insert into `cases` in the same transaction (conditional on `booking_type_unique`; a duplicate → no second case):
  - client "no" → `goalkeeper_no_show` (with `noShowIncidentId` when one was recorded);
  - goalkeeper "no" → `payment_not_received`;
  - client "yes" when `attendance` is already `no_show` → `late_attendance_claim`, with the no-show kept.

  Cases carry the `checkIn` snapshot. The fake store does the same. Tests for each row.
- [X] T030 [US4] `src/application/features/cases/` (new):
  - `ListCasesQuery(status | null, page, pageSize)`;
  - `GetCaseQuery(caseId)`, which returns the item plus the rating (via `ratingRepository`, by id) and the check-in;
  - `ResolveCaseCommand(adminId, caseId, note)`: domain validation, then `caseRepository.resolve`, then audit.

  Results per contracts §3.
- [X] T031 [US4] Admin routes in `src/controllers/adminController.ts`: `GET /cases`, `GET /cases/:caseId` and `POST /cases/:caseId/resolve`, with zod in `src/controllers/requests/cases/` (the paging, `status` enum and `note` 3–500), mapped exhaustively. Register them in DI and the test factory.
- [X] T032 [P] [US4] Unit tests `tests/unit/application/features/cases/cases.test.ts`:
  - the client's "no" without a check-in → 1 `goalkeeper_no_show` case with `noShowIncidentId`;
  - the client's "no" with a check-in → a case, no no-show;
  - the goalkeeper's "no" → `payment_not_received`;
  - a late "yes" after a silence no-show → `late_attendance_claim`, with the no-show kept;
  - the list: open first, paging;
  - resolve → resolved with who, when and the note; again → `already_resolved`; a short note → invalid.
- [X] T033 [P] [US4] HTTP `tests/http/controllers/adminCases.test.ts`: close a match without a check-in; the client rates "no" → the admin's `GET /api/admin/cases?status=open` lists 1; `GET /cases/:id` shows the rating; resolve → `200`; again → `409 case_already_resolved`; a goalkeeper token → `403`.

**Checkpoint**: SC-004 and SC-005.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T034 [P] `src/infrastructure/openapi/openapiSpec.ts`: the `/api/ratings` paths and the three admin case paths, with their schemas; the `completed` status; `WithdrawalItem.kind`. `docs/push-notifications.md`: the `goalkeeper.no_show` type and the pending-ratings flow (no push). Assert the paths in the HTTP tests.
- [X] T035 [P] Add "15. Cierre, calificación e inasistencia (spec 021)" to `_temp_pruebas.md`, from quickstart §1–§6, in Spanish.
- [X] T036 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure, including the earlier tests affected (sweep report, booking document, withdrawal item shape).
- [ ] T037 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §15).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** → **US4** → **Polish**.
- US2 needs completed bookings (US1).
- US3 needs the rating store (US2) and the incident helper (T009).
- US4 extends the rating transaction (T016).

### Parallel opportunities

- **Phase 2**:
  1. T002 ∥ T003 ∥ T004 ∥ T005 ∥ T006 ∥ T007 ∥ T010 ∥ T011;
  2. then T008 ∥ T009.
- **US1**:
  1. T012;
  2. then T013;
  3. then T014 ∥ T015.
- **US2**:
  1. T016;
  2. then T017 ∥ T018;
  3. then T019;
  4. then T020 ∥ T021.
- **US3**:
  1. T022 ∥ T023;
  2. then T024 ∥ T025 ∥ T026;
  3. then T027 ∥ T028.
- **US4**:
  1. T029;
  2. then T030;
  3. then T031;
  4. then T032 ∥ T033.
- **Polish**: T034 ∥ T035.

## Implementation Strategy

1. **Phase 1–2**: domain, collections, resolvers and the 018 helper.
2. **US1**: the MVP (bookings complete).
3. **US2**: ratings.
4. **US3**: no-shows (the heart of the guarantee).
5. **US4**: cases.
6. **Polish**.

## Notes

- **Exactly once everywhere**: completion is conditional on `assigned`, attendance on `attendance: null`, and one rating per side and case per type through the unique indexes.
- **No-shows reuse 018 completely**: the policy, the weekly count, the history and the reversal.
- **Ratings are private** (clarification 2): no endpoint returns someone else's rating, except the admin case view.
