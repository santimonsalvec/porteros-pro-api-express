---

description: "Task list for Client Cancels Bookings"
---

# Tasks: Client Cancels Bookings

**Input**: Design documents from `/specs/017-client-cancel-booking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/client-cancel.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- the lifecycle store tested on mocked collections (as `bookingLifecycleStore.test.ts`);
- unit tests of the command reusing `tests/unit/application/features/bookingLifecycle/lifecycleHarness.ts` (which has `acceptAndPay`, `balanceOf`, `match(id, hoursAhead, count, partialFulfillment)` and the notices);
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })` and the `walletTestHelpers.ts` helpers;
- no real resources.

**Organization**:
- Phase 2 prepares the shared pieces: the domain fields, the event and message variants, the refund helper extraction, the store transaction, the fake, the command and the endpoints.
- US1 (pending booking), US2 (assigned booking in time / too late) and US3 (whole request) then prove each behavior, and US3 includes 016's adjustments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US3 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 No new configuration: the deadline is each request's `freeCancellationUntil()` (010). Nothing to change.

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

### Domain and events

- [X] T002 [P] `src/domain/bookings/booking.ts`:
  - `BookingEndReason` gains `'client_cancelled'`;
  - `BookingEndedBy` gains `'client'`;
  - add `cancellationNote?: string | null` to props, and `readonly cancellationNote: string | null` (default `null`).

  Export `MAX_CANCELLATION_NOTE_LENGTH = 200` and `normalizeCancellationNote(raw?: string | null): string | null` (trims; empty → `null`; longer than 200 → throws `Error`). In `src/infrastructure/persistence/mongo/bookingRepository.ts`, `bookingToDocument` writes `cancellationNote` and `bookingFromDocument` reads it (absent → `null`). Update the expected document in `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts`. Unit-test `normalizeCancellationNote`.
- [X] T003 [P] Events:
  - `src/domain/events/bookingEvents.ts`: `BookingCancelledPayload.reason: 'cancel_all' | 'client_cancelled'`, `by: 'system' | 'client'`; `bookingCancelled(id, booking, at, refund, author: { reason; by } = { reason: 'cancel_all', by: 'system' })`;
  - `src/application/features/events/common/eventSchemas.ts`: widen the zod literals to enums.

  Extend `tests/unit/domain/events/bookingEvents.test.ts` and `eventSchemas.test.ts` with a client cancellation.
- [X] T004 [P] `src/domain/notifications/outcomeMessages.ts`: `bookingCancelledMessage(match, requestId, bookingId, refund, by: 'system' | 'client' = 'system')`. When `by === 'client'`, the body is `El cliente canceló tu partido ${where(match)}${refunded}`. Extend `outcomeMessages.test.ts`.

### Store

- [X] T005 `src/application/features/bookingLifecycle/common/ports.ts`: add `ClientCancelResult` (data-model.md), and
  `cancelByClient(args: { requestId; clientId; bookingId: string | null; now; note: string | null; owners: ReadonlyMap<string, LedgerOwner>; newId: () => string; buildEvent: (booking: Booking, refund) => DomainEvent }): Promise<ClientCancelResult>` to `IBookingLifecycleStore`.
- [X] T006 `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`:
  1. Extract the private `refund()` into a module function, `refundCommissionInSession(db, session, booking, owner, cancellation, newId, now)`. It throws the existing abort for `missing_charge`, reuses an existing refund, and otherwise appends `commissionRefundDraft`. `cancelAll` uses it.
  2. `cancelAll`: evaluate over `all.filter(b => b.cancelledBy !== 'client')`. Empty → `kept`. Otherwise use the existing logic on that subset (clarification 3).
  3. `cancelByClient`, per research §2 (steps 1–5). All refusals (`not_found`, `already_final`, `window_closed`, `owner_required`, `missing_charge`) are thrown as the abort class **before any write**, so nothing is written. `replayed` returns without writes. The conditional update sets `status: 'cancelled'`, `endedAt`, `endReason: 'client_cancelled'`, `cancelledBy: 'client'`, `cancellationNote: note`. Refunds use `{ by: 'client', at: now, reason: note ?? 'client_cancelled' }`. It deactivates the request when nothing is live.

  Extend `tests/unit/infrastructure/persistence/mongo/bookingLifecycleStore.test.ts`:
  - one pending booking cancelled, with no refund;
  - an assigned booking in time, with a refund carrying the client cancellation;
  - `window_closed` with no writes;
  - the whole request, where any assigned booking late → nothing written;
  - `replayed`;
  - `already_final`;
  - `not_found` (another client);
  - `owner_required`;
  - `cancelAll` ignoring client-cancelled bookings.
- [X] T007 [P] `tests/fakes/fakeBookingLifecycleStore.ts`: implement `cancelByClient` with the same outcomes and the synchronous check-then-write, and apply the client-cancelled exclusion to its `cancelAll`.

### Command, audit and endpoints

- [X] T008 Audit:
  - `IBookingAuditLogger` (`src/application/features/goalkeeperRequests/common/ports.ts`) gains `logClientCancellation(entry: { outcome: string; clientId: string; requestId: string; bookingId?: string }): void`;
  - implement it in `src/infrastructure/observability/pinoAuditLogger.ts` (same style as `logBookingConfirmation`) and in `tests/fakes/fakeBookingAuditLogger.ts` (recorded in `entries`, or a separate array).
- [X] T009 `src/application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.ts`:
  - `CancelBookingsByClientCommand(clientId, requestId, bookingId: string | null, reason?: string)`;
  - result: `{ outcome: 'cancelled' | 'replayed'; request: RequestResponse }` | `{ outcome: 'request_not_found' | 'booking_not_found' }` | `{ outcome: 'not_cancellable'; status }` | `{ outcome: 'window_closed'; bookingId; freeCancellationUntil: string }` | `{ outcome: 'temporarily_unavailable' }` | `{ outcome: 'invalid_reason' }`.

  The handler, in `…Handler.ts`, has deps `{ requestRepository, bookingRepository, userRepository, store, walletContext, relay, idGenerator, clock, audit, logger }`:
  1. normalize the note (error → `invalid_reason`); a malformed uuid → not found;
  2. load the request; the wrong client → `request_not_found`;
  3. load its bookings and resolve the owners of the assigned goalkeepers (`resolveGoalkeeperWalletContext`), where any not-ok → `temporarily_unavailable`;
  4. `store.cancelByClient(...)`, with `buildEvent: (b, refund) => bookingCancelled(newId(), b, now, refund, { reason: 'client_cancelled', by: 'client' })`;
  5. on `owner_required`, resolve it and retry once;
  6. `missing_charge` → log a warning, answer `temporarily_unavailable`;
  7. `cancelled` → `relay.relay(events)`;
  8. answer with `toRequestResponse(request, freshBookings, now, contacts)`, reusing `loadContacts` and `assignedGoalkeeperIds` from `goalkeeperRequests/common`;
  9. audit every outcome.
- [X] T010 Endpoints in `src/controllers/goalkeeperRequestsController.ts`:
  - `POST /bookings/:requestId/cancel` and `POST /bookings/:requestId/bookings/:bookingId/cancel`;
  - body: zod `cancelRequestSchema = z.object({ reason: z.string().trim().min(1).max(200).optional() })`, in `src/controllers/requests/goalkeeperRequests/cancelRequest.ts`;
  - an exhaustive mapping per contracts/client-cancel.md: `200` request; `404 request_not_found` / `booking_not_found`; `409 booking_not_cancellable { status }`; `409 cancellation_window_closed { bookingId, freeCancellationUntil }`; `503 cancellation_temporarily_unavailable` with `Retry-After: 60`; `400 validation_failed`.

  Register the command in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts` (the lifecycle store, `walletContext`, `eventRelay` and the audit loggers already exist there).

**Checkpoint**: tsc and `npm test` are green; the endpoints answer.

---

## Phase 3: User Story 1 - The client cancels a booking nobody has taken yet (Priority: P1) 🎯 MVP

**Goal**: A pending booking is cancelled for free, at any time while pending, idempotently, and disappears from goalkeepers.

**Independent Test**: In a 2-goalkeeper request, cancel one pending booking: cancelled, invisible to goalkeepers, the other one still searching, no money moved. Repeat: `200`, nothing new.

- [X] T011 [P] [US1] Unit tests `tests/unit/application/features/bookingLifecycle/cancelBookingsByClient.test.ts` (with `lifecycleHarness`, adding the command to it):
  - a pending booking → cancelled, with `cancelledBy: 'client'`, the note stored and one `booking.cancelled` event (`by: 'client'`);
  - a repeat → `replayed`, no new event;
  - another client → `request_not_found`;
  - a booking of another request → `booking_not_found`;
  - expired or system-cancelled → `not_cancellable` with the status;
  - a reason of 201 characters → `invalid_reason`.
- [X] T012 [P] [US1] HTTP `tests/http/controllers/clientCancel.test.ts` (pending section):
  - `createRequestAsClient` for 2 goalkeepers, cancel one → `200` with that booking `cancelled` and the other `pending_assignment`;
  - a funded goalkeeper's available matches list only the other one;
  - a repeat → `200`;
  - another client → `404`;
  - `reason` of 201 characters → `400`.

**Checkpoint**: SC-006 for pending bookings.

---

## Phase 4: User Story 2 - The client cancels a taken booking in time, and the goalkeeper is refunded and told (Priority: P1)

**Goal**: Assigned + in time → cancelled, one refund, one notice. Too late → refused, unchanged. A race with acceptance → coherent.

**Independent Test**: A goalkeeper takes a booking; the client cancels 2 h before → the balance is restored and one notice goes out. 45 min before → `409` and unchanged.

- [X] T013 [US2] `src/application/features/bookingLifecycle/handlers/goalkeeperCancellationNoticeHandler.ts`: pass `payload.by` to `bookingCancelledMessage`. Unit test: a client cancellation → "El cliente canceló tu partido…", with the amount.
- [X] T014 [P] [US2] Unit tests in `cancelBookingsByClient.test.ts`:
  - an assigned booking in time → one refund of 7000 (`cancellation.by: 'client'`, reason = note or `client_cancelled`), and the balance restored;
  - the goalkeeper notice handler, run on the relayed events → exactly 1 `booking.cancelled` notice, "El cliente canceló…";
  - a repeat → no second refund;
  - at `freeCancellationUntil` exactly → still allowed (inclusive); 1 ms later → `window_closed` with the deadline, and nothing changed;
  - an unresolvable wallet context → `temporarily_unavailable`, and nothing changed;
  - **a race**: the store sees the booking assigned after the handler read it as pending (simulate by accepting between the read and `cancelByClient` through the fake) → `owner_required`, then retried → a refund in time.
- [X] T015 [P] [US2] HTTP in `clientCancel.test.ts` (assigned section):
  - G accepts at `MATCH_NOW` (the match starts 20:00Z, the deadline is 19:00Z);
  - the client cancels at 18:40Z → `200`; G's wallet balance is restored; one `commission_refund` with `cancellation.by: 'client'`; G's inbox has `booking.cancelled` with "El cliente canceló"; G's agenda shows `cancelled`;
  - another request with G assigned, clock at 19:15Z → `409 cancellation_window_closed` with `freeCancellationUntil`, and the booking still `assigned`.

**Checkpoint**: SC-002, SC-003 and SC-004 (fakes).

---

## Phase 5: User Story 3 - The client cancels the whole request (Priority: P1)

**Goal**: The whole request is cancelled all or nothing. It's refused as a whole if any assigned booking is late. It's deactivated when nothing is live. 016 adjusted.

**Independent Test**: A request with one booking taken and one searching, 2 h before → both cancelled, one refund, and a new request for the match is allowed. 45 min before → `409`, and both unchanged.

- [X] T016 [US3] 016 adjustments in `src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.ts`:
  - return early for `booking.cancelled` events whose `payload.by === 'client'`;
  - compute the outcome over `bookings.filter(b => b.cancelledBy !== 'client')`; if that is empty, send no notice.

  Unit tests in `bookingExpiry.test.ts` / `cancelAll.test.ts`:
  - the client cancels one of 2, the other expires → `request.expired`;
  - the client cancels everything → no client notice;
  - "cancel all" where the client cancelled one booking and the other is assigned → kept at evaluation (clarification 3).
- [X] T017 [P] [US3] Unit tests in `cancelBookingsByClient.test.ts` (whole request):
  - in time → all cancelled, one refund per assigned booking, the request inactive, status `cancelled`;
  - an assigned booking late → `window_closed` and **nothing** changed, not even the pending one;
  - a repeat after all cancelled → `replayed`;
  - an all-expired request → `not_cancellable`.
- [X] T018 [P] [US3] HTTP in `clientCancel.test.ts` (whole request):
  - in time → `200` with status `cancelled`, then quote and confirm the same match again → `201` (FR-019 of 016 / SC-007);
  - late with G assigned → `409`, and `GET /bookings` shows the pending booking still `pending_assignment`.

**Checkpoint**: SC-001, SC-005 and SC-007.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] `src/infrastructure/openapi/openapiSpec.ts`: the 2 paths with body, responses and bearer security; the `booking.cancelled` wording in `docs/push-notifications.md` (the client-cancellation text). Assert the paths exist in the HTTP tests.
- [X] T020 [P] Add "11. Cancelación por el cliente (spec 017)" to `_temp_pruebas.md` from quickstart §1–§4.
- [X] T021 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T022 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §11): the dev-cluster walk-through and the accept-vs-cancel concurrency.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** → **Polish**.
- US1, US2 and US3 all use the Phase 2 command. They're ordered by risk: US2 adds money, and US3 adds the all-or-nothing request rule and the 016 adjustments.

### Parallel opportunities

- Phase 2: T002 ∥ T003 ∥ T004; then T005; then T006 ∥ T007 ∥ T008; then T009; then T010.
- US1: T011 ∥ T012.
- US2: T013, then T014 ∥ T015.
- US3: T016, then T017 ∥ T018.
- Polish: T019 ∥ T020.

## Implementation Strategy

1. Phase 1–2: the whole mechanism, green.
2. US1: the MVP (a free cancellation of a searching booking).
3. US2: money and the last-hour rule.
4. US3: the whole request and the 016 alignment.
5. Polish.

## Notes

- **Refusals never write**: every refusal is decided inside the transaction before its first write.
- **One refund per booking**: the shared `commission_refund:{bookingId}` key, via `refundCommissionInSession`.
- **The client is never notified of their own cancellation.**
