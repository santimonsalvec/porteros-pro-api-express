---

description: "Task list for Client Request Notices"
---

# Tasks: Client Request Notices

**Input**: Design documents from `/specs/019-client-request-notices/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/client-notices.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- repositories tested on mocked collections;
- unit tests reusing `tests/unit/application/features/bookingLifecycle/lifecycleHarness.ts` (`match`, `acceptAndPay`, `assign`, `withdraw`, `relayed`, notifications, push sender);
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })`, `signInClient`, `signInGoalkeeper`, `createRequestAsClient`, `ownerOf` and `MATCH_NOW` (18:30Z; match at 20:00Z; contacts visible from 19:00Z; with `startsAt` 17:00 local the match is at 22:00Z and contacts are visible from 21:00Z);
- no real resources.

**Organization**:
- Phase 2 prepares:
  - the domain rules;
  - the messages;
  - the `notifyOnce` helper;
  - the repository methods.
- Then the stories, in the order that de-risks the existing views first:
  - **US3**: contact visibility, which changes 010, 012, 017 and 018 answers;
  - **US1 and US2**: the assignment consumer;
  - **US4**: the contacts-visible sweep.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 No new dependency or configuration: the visibility moment is each request's `freeCancellationUntil()` (010).

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

- [X] T002 [P] `src/domain/bookings/contactVisibility.ts` (new):
  - `contactsVisibleFrom(request: GoalkeeperRequest): Date` = `request.freeCancellationUntil()`;
  - `contactsVisibleAt(request, now): boolean` (inclusive);
  - `isRequestComplete(bookings)`: no `pending_assignment`, and at least one `assigned`;
  - `completionRound(bookings): string | null`: the latest booking with `replacesBookingId` (by `createdAt`, then id).

  Move 018's `outcomeKey` logic in `src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.ts` onto `completionRound`, with unchanged keys. Tests in `tests/unit/domain/bookings/contactVisibility.test.ts`:
  - the inclusive boundary;
  - complete with a client-cancelled or withdrawn booking;
  - not complete while one is pending, or when nothing is assigned;
  - the rounds.
- [X] T003 [P] `src/domain/notifications/assignmentMessages.ts` (new), per research §5. Its types: `GOALKEEPER_ASSIGNED_TYPE = 'booking.goalkeeper_assigned'`, `REQUEST_COMPLETE_TYPE = 'request.complete'`, `CONTACTS_VISIBLE_TYPE = 'request.contacts_visible'`, `CLIENT_CONTACT_VISIBLE_TYPE = 'booking.client_contact_visible'`. Its functions:
  - `goalkeeperAssignedMessage(match, requestId, bookingId, { replacement: boolean; contact: Contact | null })`;
  - `requestCompleteMessage(match, requestId, bookingId, goalkeeperCount, contacts: Contact[] | null)`: `null` means the contacts aren't visible yet ("Verás sus datos 1 hora antes."), and a list means they are named;
  - `contactsVisibleMessage(match, requestId, contacts: Contact[])`;
  - `clientContactVisibleMessage(match, requestId, bookingId, contact: Contact)`.

  A missing name falls back to "Tu portero" / "Tu cliente", and a missing WhatsApp is omitted. `data` holds only string values. The messages take a domain type `PersonContact { firstName; lastName; whatsApp }`, defined in the messages file: the domain can't import the application's `Contact`, which satisfies it structurally. Tests in `tests/unit/domain/notifications/assignmentMessages.test.ts`:
  - every variant;
  - no double period or NBSP;
  - valid push (`validatePushMessage`);
  - no name or phone in the variants without contacts.
- [X] T004 [P] `src/application/features/bookingLifecycle/common/notifyOnce.ts` (new): `notifyOnce(deps: { notifications; pushNotifier; idGenerator; clock }, { userId, message, dedupeKey }): Promise<boolean>`, which does `createIfAbsent` and then, only if it was created, `sendToUsers`. Refactor `src/application/features/bookingLifecycle/handlers/withdrawalNoticeHandler.ts` to use it, with the same behaviour and a logged outcome. Unit test: created → pushed; duplicate → no push.
- [X] T005 [P] `src/domain/bookings/goalkeeperRequest.ts`:
  - add `contactsRevealedAt: Date | null` (props optional, default `null`);
  - map it in `src/infrastructure/persistence/mongo/goalkeeperRequestRepository.ts` (`requestToDocument` / `requestFromDocument`; absent → `null`);
  - `ensureIndexes` adds `contactsReveal_due` `{ contactsRevealedAt: 1, startsAt: 1 }`;
  - new methods on `IGoalkeeperRequestRepository` (`src/application/features/goalkeeperRequests/common/ports.ts`):
    - `findDueForContactsReveal(now, cap)`: `{ active: true, contactsRevealedAt: null, startsAt: { $gt: now, $lte: now + 1 day } }`, sorted by `startsAt`, filtered by `contactsVisibleAt`;
    - `markContactsRevealed(requestId, now): Promise<boolean>`: a conditional `updateOne` on `contactsRevealedAt: null`.

  Implement both in `tests/fakes/fakeGoalkeeperRequestRepository.ts`. Update the expected documents in the repository tests and add query tests in `tests/unit/infrastructure/persistence/mongo/goalkeeperRequestRepository.test.ts`.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 3 - Client and goalkeeper see each other only in the last hour (Priority: P1)

**Goal**: No view reveals the other party's name or WhatsApp before start − 60 min, and every view says from when it will.

**Independent Test**: G takes a booking 3 h before the match. The client's request shows `goalkeeper: null`, and G's agenda and acceptance show `client: null`, both with the visible-from time. At start − 60 min both show the contacts.

- [X] T006 [US3] `src/application/features/goalkeeperRequests/common/requestResponse.ts`:
  - `RequestResponse` gains `contactsVisibleFrom: string`;
  - `toRequestResponse` sets `goalkeeper` to the contact only when `contactsVisibleAt(request, now)`, and to `null` otherwise.

  Its callers already pass `now`: confirm, list, cancel and replay. Unit tests in the existing requestResponse tests (before, at, and after the moment).
- [X] T007 [US3] `src/application/features/goalkeeperRequests/common/goalkeeperBookingResponse.ts`:
  - `AgendaItem` gains `clientContactVisibleFrom: string`;
  - `toAgendaItem(booking, context, client, now)` sets `client` only when `contactsVisibleAt(request, now)` and the booking is `assigned`, and to `null` otherwise.

  Pass `now` from the callers: `listGoalkeeperAgendaQueryHandler.ts`, `acceptBookingCommandHandler.ts` and `withdrawFromBookingCommandHandler.ts`, plus any other caller the compiler lists. Unit tests for the three cases.
- [X] T008 [US3] Update the existing unit and HTTP tests whose expectations assumed a contact right after acceptance:
  - `tests/http/controllers/goalkeeperAgenda.test.ts`;
  - `goalkeeperAcceptBooking.test.ts`;
  - `goalkeeperRequestsBookings.test.ts` / `goalkeeperRequestsBookingsList.test.ts`;
  - `clientCancel.test.ts`;
  - `goalkeeperWithdraw.test.ts`;
  - any unit test that fails.

  Either expect `null` plus the visible-from field, or move the clock into the last hour where the test is about the contact itself.
- [X] T009 [P] [US3] HTTP `tests/http/controllers/contactVisibility.test.ts`. G accepts a 22:00Z match at `MATCH_NOW`:
  - the client's `GET /api/goalkeeper-requests/bookings` → `goalkeeper: null`, `contactsVisibleFrom: '2026-09-21T21:00:00.000Z'`;
  - G's agenda → `client: null`, `clientContactVisibleFrom` the same;
  - clock at 21:00Z → both show the contacts;
  - a booking G withdrew from → `client: null` even at 21:30Z;
  - a match accepted at 19:10Z for 20:00Z (inside the last hour) → the acceptance answer already has the client's contact.

**Checkpoint**: SC-006 for views.

---

## Phase 4: User Story 1 - The client learns a goalkeeper took one of their bookings (Priority: P1) 🎯 MVP

**Goal**: One `booking.goalkeeper_assigned` notice per acceptance that doesn't complete the request, with no contact before the last hour, and a replacement wording.

**Independent Test**: In a 2-goalkeeper request, one acceptance → exactly one notice, no name, with the request id.

- [X] T010 [US1] `src/application/features/bookingLifecycle/handlers/clientAssignmentNoticeHandler.ts` (new), a consumer of `goalkeeper.assigned` (`CLIENT_ASSIGNMENT_EVENT_TYPES = ['goalkeeper.assigned']`, name `client-assignment-notices`, `runOnce`). Its deps are like `WithdrawalNoticeHandler` plus `bookingRepository` and `userRepository`. Per research §2:
  1. load the request, its bookings and the event's booking;
  2. skip when the booking is not `assigned` to `payload.goalkeeperId`, or `now ≥ booking.endsAt`;
  3. choose the kind with `isRequestComplete`;
  4. load contacts only for bookings with `assignedAt ≥ contactsVisibleFrom`: for "assigned", the goalkeeper; for "complete", every such booking;
  5. `notifyOnce` to the client, with the key `goalkeeper-assigned:{bookingId}` or `request-complete:{requestId}` plus `:{round}` when `completionRound` isn't null.

  Register it with `registerSubscribers` in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`, and add it to `lifecycleHarness` (`assignmentNotices`).
- [X] T011 [P] [US1] Unit tests `tests/unit/application/features/bookingLifecycle/clientAssignmentNotices.test.ts`:
  - 2-goalkeeper request, first acceptance → 1 `booking.goalkeeper_assigned`, the body without name or phone, and `data` `{ type, requestId, bookingId }`;
  - a redelivery → still 1 entry and 1 push;
  - the booking cancelled or withdrawn before processing → nothing;
  - processed after the match ended → nothing;
  - a replacement (after `h.withdraw`) accepted by another goalkeeper → "Encontramos otro portero";
  - accepted in the last hour → the notice carries the goalkeeper's name and WhatsApp.

**Checkpoint**: SC-001, SC-003 and SC-004.

---

## Phase 5: User Story 2 - The client learns the request is complete (Priority: P1)

**Goal**: One `request.complete` per completion round, replacing the "assigned" notice for that acceptance.

**Independent Test**: A 1-goalkeeper request accepted → only "Tu portero está confirmado". A 2-goalkeeper request with both accepted → one "assigned" and one "complete".

- [X] T012 [P] [US2] Unit tests in `clientAssignmentNotices.test.ts`:
  - 1-goalkeeper request → exactly 1 `request.complete` ("Tu portero está confirmado … Verás sus datos 1 hora antes.") and no `booking.goalkeeper_assigned`;
  - 2 goalkeepers, sequential → 1 assigned + 1 complete;
  - 2 goalkeepers, both events processed after both acceptances → 1 complete only (never 2);
  - one booking cancelled by the client, the other accepted → complete;
  - complete, then a withdrawal, then the replacement accepted → a second `request.complete` with the round key;
  - complete in the last hour → lists names and WhatsApp.
- [X] T013 [P] [US2] HTTP `tests/http/controllers/clientAssignmentNotices.test.ts` (local events):
  - the client books 2 goalkeepers for 22:00Z, G accepts → the client's inbox has `booking.goalkeeper_assigned`; H accepts → `request.complete`, 2 entries in total, and push calls to the client = 2;
  - a 1-goalkeeper request → 1 `request.complete`;
  - a late request (20:00Z at `MATCH_NOW`), with G accepting at 19:10Z → `request.complete` names G with the WhatsApp.

**Checkpoint**: SC-002.

---

## Phase 6: User Story 4 - Both parties are told when they can see each other (Priority: P2)

**Goal**: At start − 60 min, one notice to the client and one per goalkeeper assigned before then, exactly once. Nothing for last-hour assignments or after the start.

**Independent Test**: A request fully assigned the day before → at start − 60 the client gets 1 notice with both contacts and each goalkeeper gets 1 with the client's; running the sweep again sends nothing.

- [X] T014 [US4] `src/application/features/bookingLifecycle/jobs/contactsRevealJob.ts` (new, `IScheduledJob`, name `contacts-reveal`, `leaseSeconds = 55`, `cap` of 500). Per research §4:
  1. `findDueForContactsReveal`;
  2. for each request, its bookings `assigned` with `assignedAt < contactsVisibleFrom`;
  3. `loadContacts` for the client and those goalkeepers;
  4. if any, `notifyOnce` the client (`contacts-visible:{requestId}`) and each goalkeeper (`client-contact-visible:{bookingId}`);
  5. then `markContactsRevealed`.

  One request failing is logged and doesn't stop the others. It returns a summary string, like the other jobs. Register it last in the sweep `jobs` list in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`. Update the sweep report expectations (`tests/http/controllers/internalEvents.test.ts` and any unit test that lists the jobs).
- [X] T015 [P] [US4] Unit tests `tests/unit/application/features/bookingLifecycle/contactsReveal.test.ts` (lifecycle harness plus the job, with a user repository seeded with names and phones):
  - 2 assigned the day before, at start − 61 → nothing; at start − 60 → the client has 1 `request.contacts_visible` with both names and WhatsApp, and each goalkeeper has 1 `booking.client_contact_visible` with the client's;
  - a second run → nothing new, and the request is marked;
  - one booking assigned at start − 50 → it isn't included, and gets no goalkeeper notice;
  - no assigned booking → nothing sent, and marked;
  - a "cancel all" request cancelled at the same instant (cancel-all runs first) → nothing sent;
  - a run after the start → nothing;
  - a failure writing one request's notices → the others still processed.
- [X] T016 [P] [US4] HTTP in `tests/http/controllers/clientAssignmentNotices.test.ts`: a request for 22:00Z fully accepted at `MATCH_NOW`; clock at 21:00Z; `POST /internal/sweep` with the internal token helper used by `internalEvents.test.ts` → the client's inbox has `request.contacts_visible`, and G's has `booking.client_contact_visible`; a second sweep adds nothing.

**Checkpoint**: SC-007.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T017 [P] `src/infrastructure/openapi/openapiSpec.ts`: `RequestResponse.contactsVisibleFrom` and `AgendaItem.clientContactVisibleFrom` (required), and the `goalkeeper` / `client` descriptions (null before the moment). `docs/push-notifications.md`: the 4 types and the visibility rule.
- [X] T018 [P] Add "13. Avisos al cliente y visibilidad de datos (spec 019)" to `_temp_pruebas.md`, from quickstart §1–§5, in Spanish.
- [X] T019 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T020 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §13).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US3** (changes shared views) → **US1** → **US2** → **US4** → **Polish**.
- US1 and US2 share the consumer (T010). US4 needs T004, T005 and the messages.

### Parallel opportunities

- **Phase 2**: T002 ∥ T003 ∥ T004 ∥ T005.
- **US3**:
  1. T006 ∥ T007;
  2. then T008;
  3. then T009.
- **US1**: T010, then T011.
- **US2**: T012 ∥ T013.
- **US4**: T014, then T015 ∥ T016.
- **Polish**: T017 ∥ T018.

## Implementation Strategy

1. **Phase 1–2**: rules, messages, helper and queries.
2. **US3**: close the early-contact leak in every view (owner rule).
3. **US1 + US2**: assignment and completion notices (the MVP of the notices).
4. **US4**: the one-hour-before notices.
5. **Polish**.

## Notes

- **One rule, one place**: every view goes through `toRequestResponse` or `toAgendaItem`, and both apply `contactsVisibleAt`.
- **"Contains contacts" is decided by `assignedAt`**, never by when a notice is processed, so the consumer and the sweep never both reveal the same booking.
- **Notices before marks**: the sweep writes the idempotent notices first, then marks the request.
