---

description: "Task list for Goalkeeper Withdrawal, Penalties and Suspensions"
---

# Tasks: Goalkeeper Withdrawal, Penalties and Suspensions

**Input**: Design documents from `/specs/018-goalkeeper-withdrawal-penalties/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/withdrawals.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- the lifecycle store tested on mocked collections (as `bookingLifecycleStore.test.ts`);
- unit tests of the commands reusing `tests/unit/application/features/bookingLifecycle/lifecycleHarness.ts` (`acceptAndPay`, `balanceOf`, `match(id, hoursAhead, count, partialFulfillment)`, `cancel`, the notices) and `tests/unit/application/features/notifications/offerHarness.ts`;
- HTTP tests with `await buildTestApp({ eventsMode: 'local' })`, `signInClient`, `signInGoalkeeper`, `createRequestAsClient`, `ownerOf` and `MATCH_NOW` (18:30Z; match at 20:00Z; search ends 19:30Z);
- no real resources.

**Organization**:
- Phase 2 builds the shared pieces:
  - the domain (booking fields, incident, policy, config, events, messages);
  - the store transaction `withdraw`, and its fake;
  - the incident repository.
- **US1** (withdrawal and replacement, the MVP): the command, the endpoint, the offer renewal, the client notice and the 016 adjustments.
- **US2** (penalties): wiring the policy into the command, and the suspension notice.
- **US3**: the history.
- **US4**: the admin reversal.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 No new dependency or environment variable: the penalty values live in `bookingSettings` (country scope), with code defaults. Confirm the dev `bookingSettings` country document needs no change: the defaults apply, with a warning.

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

### Domain

- [X] T002 [P] `src/domain/bookings/booking.ts`:
  - `BookingEndReason` gains `'goalkeeper_withdrew'`, and `BookingEndedBy` gains `'goalkeeper'`;
  - new props `replacesBookingId?: string | null` and `excludedGoalkeeperIds?: readonly string[]`, with readonly fields defaulting to `null` and `[]`;
  - `static replacementFor(original: Booking, id: string, withdrawingGoalkeeperId: string, now: Date): Booking`:
    - it copies `requestId`, `clientId`, `zoneId`, `startsAt`, `endsAt`, `price`, `commission`, `travelBufferMinutes` and `searchEndsAt`;
    - `status: 'pending_assignment'`, no goalkeeper, `createdAt: now`, `replacesBookingId: original.id`;
    - `excludedGoalkeeperIds`: the original's plus the withdrawing goalkeeper, without duplicates;
  - `withdrawalNoticeMinutes(now)` = `Math.max(0, Math.floor((startsAt − now) / 60_000))`.

  `src/infrastructure/persistence/mongo/bookingRepository.ts`: `bookingToDocument` and `bookingFromDocument` map both fields (absent → `null` / `[]`). Update the expected document in `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts`. Unit-test both methods in `tests/unit/domain/bookings/booking.test.ts`, including a replacement of a replacement, which excludes both goalkeepers.
- [X] T003 [P] `src/domain/bookings/offerEligibility.ts`: `isEligible` returns `false` when `booking.excludedGoalkeeperIds.includes(snapshot.goalkeeperId)`. Add the case to `tests/unit/domain/bookings/offerEligibility.test.ts`.
- [X] T004 [P] `src/domain/goalkeepers/penaltyPolicy.ts` (new):
  - `GoalkeeperPenaltyConfig { lateNoticeMinutes; lateSuspensionDays; weeklyLimit; windowDays; limitSuspensionDays }`;
  - `DEFAULT_GOALKEEPER_PENALTIES` = `{ 120, 3, 3, 7, 7 }`;
  - `isLate(noticeMinutes, config)`: strict `<`;
  - `penaltiesFor({ occurredAt, late, recentCount, config, newId })`: `PenaltyDraft[]`. A late incident adds a `late` penalty of `lateSuspensionDays`. `recentCount + 1 >= weeklyLimit` adds a `weekly_limit` penalty of `limitSuspensionDays`. Each penalty has `startsAt = occurredAt` and `endsAt = occurredAt + days × 86 400 000`.

  Tests in `tests/unit/domain/goalkeepers/penaltyPolicy.test.ts`:
  - exactly 120 minutes → not late; 119 → late;
  - the 3rd incident → a weekly penalty; the 4th → again; the 2nd → none;
  - late plus weekly → both.
- [X] T005 [P] `src/domain/goalkeepers/goalkeeperIncident.ts` (new). The `GoalkeeperIncident` entity (fields per data-model.md), with:
  - `Penalty` and `PenaltyReversal` types;
  - `MoneyReversal`;
  - `countsTowardLimit()`;
  - `penaltiesInForce(now)`.

  Export `suspensionEndOf(incidents, now): Date | null`, the latest `endsAt` among the penalties in force. Tests in `tests/unit/domain/goalkeepers/goalkeeperIncident.test.ts`:
  - overlapping penalties → the latest end, never a sum;
  - reversed and past penalties are ignored;
  - no penalties → `null`.
- [X] T006 [P] `src/domain/pricing/bookingSettings.ts`: an optional `goalkeeperPenalties: Partial<GoalkeeperPenaltyConfig> | null`. Each present field must be an integer ≥ 1, else `InvalidConfigurationError`. `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts` maps it. Extend `tests/unit/domain/pricing/bookingSettings.test.ts` and `tests/unit/infrastructure/persistence/mongo/bookingSettingsRepository.test.ts`.
- [X] T007 [P] Events.
  - `src/domain/events/bookingEvents.ts`:
    - `BookingCreatedPayload.replacesBookingId?: string`, which `bookingCreated` sets when the booking has one;
    - the new `GoalkeeperWithdrewPayload` (data-model.md), a `GoalkeeperWithdrewEvent` of type `goalkeeper.withdrew`, and the factory `goalkeeperWithdrew(id, withdrawn: Booking, incident, replacement: Booking | null, suspendedUntil: Date | null, at)`;
    - added to `BookingEvent`.
  - `src/application/features/events/common/eventSchemas.ts`: the zod schema for `goalkeeper.withdrew`, and the optional `replacesBookingId`.

  Extend `tests/unit/domain/events/bookingEvents.test.ts` and the event schema tests.
- [X] T008 [P] `src/domain/notifications/withdrawalMessages.ts` (new):
  - `GOALKEEPER_WITHDREW_TYPE = 'booking.goalkeeper_withdrew'` and `GOALKEEPER_SUSPENDED_TYPE = 'goalkeeper.suspended'`;
  - `goalkeeperWithdrewMessage(match, requestId, bookingId, replaced: boolean)`, titled "Tu portero se retiró":
    - with a replacement: `Tu portero se retiró del partido ${where}. Ya estamos buscando otro portero.`;
    - without one: `… No alcanzamos a buscar otro portero.`;
  - `goalkeeperSuspendedMessage(until: Date, timeZone, requestId, bookingId)`: "Quedaste suspendido hasta el {localWhen(until)} por retirarte de un partido."

  Reuse `localWhen` and export `where` from `outcomeMessages.ts` if needed. Tests in `tests/unit/domain/notifications/withdrawalMessages.test.ts`, checking there's no double period or non-breaking space.

### Ports, store, repository and fakes

- [X] T009 `src/application/features/bookingLifecycle/common/ports.ts`:
  - `WithdrawResult` and `ReversalOutcome` (data-model.md);
  - `IBookingLifecycleStore.withdraw(args: { bookingId; goalkeeperId; now; note: string | null; config: GoalkeeperPenaltyConfig; newId: () => string; buildEvents: (withdrawn: Booking, incident: GoalkeeperIncident, replacement: Booking | null, suspendedUntil: Date | null) => DomainEvent[] }): Promise<WithdrawResult>`;
  - `IBookingLifecycleStore.reverseWithdrawal(args: { goalkeeperId; withdrawalId; adminId; refund: boolean; liftSuspension: boolean; reason: string; now; owner: LedgerOwner | null; newId }): Promise<ReversalOutcome>`;
  - the new `IGoalkeeperIncidentRepository { listForGoalkeeper(goalkeeperId, skip, limit): Promise<GoalkeeperIncident[]>; countForGoalkeeper(goalkeeperId): Promise<number> }`.

  `suspendedUntil` in `WithdrawResult` is the goalkeeper's end after the transaction.
- [X] T010 `src/infrastructure/persistence/mongo/goalkeeperIncidentRepository.ts` (new):
  - `GOALKEEPER_INCIDENTS_COLLECTION = 'goalkeeperIncidents'`;
  - `incidentToDocument` / `incidentFromDocument` (exported, for the store);
  - `ensureIndexes()`: `goalkeeper_occurred` `{ goalkeeperId: 1, occurredAt: -1, _id: -1 }` and `kind_booking_unique` `{ kind: 1, bookingId: 1 }` unique;
  - `listForGoalkeeper` sorted newest first, and `countForGoalkeeper`.

  Test in `tests/unit/infrastructure/persistence/mongo/goalkeeperIncidentRepository.test.ts` (mapping round trip, indexes, sort). Register `ensureIndexes` where the other repositories are in `src/infrastructure/di.ts`.
- [X] T011 `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`: `withdraw`, per research §2, in one transaction.
  1. Read the booking. The refusals (`not_found`, `not_withdrawable`, `match_started`) are returned before any write.
  2. `replayed`: if it's `goalkeeper_withdrew` with this `goalkeeperId`, return the stored incident (found by `kind: 'withdrawal', bookingId`) and the profile's current `suspendedUntil`.
  3. The conditional update `{ _id, status: 'assigned', goalkeeperId }` sets `status: 'goalkeeper_withdrew'`, `endedAt`, `endReason: 'goalkeeper_withdrew'`, `cancelledBy: 'goalkeeper'` and `cancellationNote: note`.
  4. If `booking.isSearchOpenAt(now)`, insert `Booking.replacementFor(...)`.
  5. Read the goalkeeper's incidents with `occurredAt > now − windowDays` and `forgivenAt: null` → `recentCount`. Then `penaltiesFor(...)` and insert the incident.
  6. Read the incidents with a penalty ending after now, and compute `suspensionEndOf` including the new one. `updateOne` the goalkeeper profile (`{ userId: goalkeeperId }`) with `$set: { suspendedUntil, penaltiesUpdatedAt: now }`. This is always written.
  7. `appendEventsInSession(buildEvents(...))`, then `deactivateIfEnded`.

  `cancelAll` also filters out `status === 'goalkeeper_withdrew'` before evaluating (research §10).

  Extend `tests/unit/infrastructure/persistence/mongo/bookingLifecycleStore.test.ts` (mocked collections):
  - a withdrawal with a replacement: the booking update, the replacement insert, the incident insert, the profile `$set` and the events;
  - no replacement after the search end;
  - `replayed`, `not_withdrawable`, `match_started` and `not_found`, with no writes;
  - `cancelAll` ignoring withdrawn bookings.
- [X] T012 `tests/fakes/fakeBookingLifecycleStore.ts`: `withdraw` with the same outcomes and a synchronous check-then-write, over the fake bookings, an in-memory incident list and the fake profile repository (so `suspendedUntil` is visible to eligibility and accept). Expose `incidents` for the tests. Its `cancelAll` excludes withdrawn bookings. Add `tests/fakes/fakeGoalkeeperIncidentRepository.ts` (it reads the fake store's list).
- [X] T013 [P] Audit:
  - `IBookingAuditLogger` (`src/application/features/goalkeeperRequests/common/ports.ts`) gains `logWithdrawal({ outcome, goalkeeperId, bookingId, requestId? })` and `logPenaltyReversal({ outcome, adminId, goalkeeperId, withdrawalId })`;
  - implement them in `src/infrastructure/observability/pinoAuditLogger.ts` and `tests/fakes/fakeBookingAuditLogger.ts`.
- [X] T014 [P] `src/application/features/bookingLifecycle/common/penaltyConfig.ts` (new): `resolvePenaltyConfig(deps: { walletContext; bookingSettingsRepository; logger }, goalkeeperId)`:
  - it resolves the country (`resolveGoalkeeperWalletContext`) and the country-scope `goalkeeperPenalties` (`findFor(profile.cityId, countryId).country`);
  - it merges over `DEFAULT_GOALKEEPER_PENALTIES`;
  - it logs `penalty_config_defaulted` (warn, with the missing fields) when something was defaulted, and never throws.

  Tests in `tests/unit/application/features/bookingLifecycle/penaltyConfig.test.ts`: full, partial and absent config, and an unresolvable country.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - A goalkeeper withdraws, a replacement is searched, and the client is told (Priority: P1) 🎯 MVP

**Goal**: The goalkeeper withdraws before the start; there's no refund; a replacement is created and offered (except to the goalkeeper who withdrew) while the search is open; the client gets one notice; the withdrawal is idempotent; a race with the client's cancellation gives one outcome.

**Independent Test**:
- 3 h before: withdrawn, balance unchanged, a replacement pending and offered to H but not G, one client notice.
- After the search end: no replacement, with the "couldn't be replaced" notice.

- [X] T015 [US1] `src/application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommand.ts`:
  - `WithdrawFromBookingCommand(goalkeeperId, bookingId, reason?)`;
  - result: `{ outcome: 'withdrawn' | 'replayed'; booking: AgendaItem; withdrawal: WithdrawalSummary }` | `{ outcome: 'not_a_goalkeeper' | 'booking_not_found' | 'invalid_reason' }` | `{ outcome: 'not_withdrawable'; status }` | `{ outcome: 'match_started'; startsAt: string }`.

  `WithdrawalSummary` is `{ withdrawalId, occurredAt, noticeMinutes, late, replacementCreated, penalties, suspendedUntil }`, built in `src/application/features/bookingLifecycle/common/withdrawalResponses.ts` (new; also `toWithdrawalItem(incident, view: 'goalkeeper' | 'admin')` per contracts §2–§3).

  The handler (`…Handler.ts`), with deps `{ goalkeeperProfileRepository, walletContext, bookingSettingsRepository, store, bookingRepository, requestRepository, zoneRepository, cityRepository, userRepository, relay, idGenerator, clock, audit, logger }`:
  1. `normalizeCancellationNote`, where an error gives `invalid_reason`;
  2. a malformed uuid → `booking_not_found`;
  3. no profile → `not_a_goalkeeper`;
  4. `resolvePenaltyConfig`;
  5. `store.withdraw`, with `buildEvents` producing `goalkeeperWithdrew(...)` plus `bookingCreated(...)` for the replacement (the request is loaded for `goalkeeperCount`);
  6. `withdrawn` → `relay.relay(events)`;
  7. answer with `toAgendaItem` (012's `loadBookingItemContext` + `loadContacts`, as the accept handler does);
  8. audit every outcome.
- [X] T016 [US1] 015 offer renewal (research §4).
  - `INotificationRepository.renewOffer(offer: NewOffer): Promise<boolean>`, in `src/application/features/notifications/common/ports.ts`.
  - Mongo, in `src/infrastructure/persistence/mongo/notificationRepository.ts`: `updateOne({ userId, requestId, type: OFFER_TYPE, 'data.bookingId': { $ne: offer.data.bookingId } }, { $set: { title, body, data, createdAt, readAt: null, dismissedAt: null, notifiedAt: null, reminderCount: 0, lastRemindedAt: null } })`. `modifiedCount === 1` → `true`. Otherwise, when no offer exists for the user and request → `createOfferIfAbsent`. Else → `false`.
  - `tests/fakes/fakeNotificationRepository.ts`: the same semantics.
  - `OfferSendMode` gains `'renew'`. In `src/application/features/notifications/common/offerSender.ts`, `renew` uses `renewOffer` instead of `createOfferIfAbsent`, and otherwise behaves like `first`.
  - `NotifyBookingOffersCommandHandler` uses `'renew'` when `booking.replacesBookingId !== null`.

  Tests:
  - `offerSender.test.ts`: renew resets a dismissed offer and pushes once; a redelivery pushes nothing;
  - `notifyBookingOffers.test.ts`: a replacement reaches H (who had dismissed the original offer) and not the excluded G;
  - `notificationRepository.test.ts`: the renew filter and update.
- [X] T017 [US1] `src/application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommandHandler.ts`: `classify` returns `{ outcome: 'not_available' }` when `booking.excludedGoalkeeperIds.includes(goalkeeperId)`. Unit test in the existing accept tests.
- [X] T018 [US1] `src/application/features/bookingLifecycle/handlers/withdrawalNoticeHandler.ts` (new), a consumer of `goalkeeper.withdrew` (`runOnce`, name `withdrawal-notices`), with deps like `ClientOutcomeNoticeHandler`:
  - the client notice `goalkeeperWithdrewMessage(match, requestId, bookingId, replacementBookingId !== null)`, with dedupe `withdrawal-client:{bookingId}`, pushed only when created;
  - the suspension notice when `payload.suspendedUntil` isn't `null` (for US2), with dedupe `withdrawal-suspension:{bookingId}`, to `payload.goalkeeperId`.

  Register it with `registerSubscribers` in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`, and add it to `lifecycleHarness` (`withdrawalNotices`).
- [X] T019 [US1] 016 adjustments in `src/application/features/bookingLifecycle/handlers/clientOutcomeNoticeHandler.ts`:
  - compute over `bookings.filter(b => b.cancelledBy !== 'client' && b.status !== 'goalkeeper_withdrew')`;
  - the dedupe key is `request-outcome:{requestId}`, or `request-outcome:{requestId}:{id of the latest-created booking with replacesBookingId}` when the request has replacements.

  Unit tests in `tests/unit/application/features/bookingLifecycle/bookingExpiry.test.ts` / `cancelAll.test.ts`:
  - a replacement expires after an earlier outcome notice → a second, final notice;
  - "cancel all": the withdrawal before the evaluation, and the replacement still pending at start − 60 → the whole request cancelled, and the other goalkeeper refunded.
- [X] T020 [US1] Endpoint `POST /me/bookings/:bookingId/withdraw` in `src/controllers/goalkeeperController.ts`:
  - body: zod `withdrawRequestSchema = z.object({ reason: z.string().trim().max(200).optional() })`, in `src/controllers/requests/withdrawals/withdrawRequest.ts`;
  - an exhaustive mapping per contracts §1: `200`; `404 goalkeeper_not_found` / `booking_not_found`; `409 booking_not_withdrawable { status }`; `409 match_started { startsAt }`; `400 validation_failed`.

  Register the command in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`.
- [X] T021 [P] [US1] Unit tests `tests/unit/application/features/bookingLifecycle/withdrawFromBooking.test.ts` (`lifecycleHarness` with the command):
  - assigned 3 h ahead → `withdrawn`: the booking is `goalkeeper_withdrew` (with the note), the balance is unchanged, no `commission_refund`, a replacement exists (same price, commission and search end, `excludedGoalkeeperIds: [G]`), and the events are 1 `goalkeeper.withdrew` + 1 `booking.created` with `replacesBookingId`;
  - the notice handler on the relayed events → 1 client notice "Ya estamos buscando otro portero";
  - after the search end → no replacement, the "No alcanzamos" notice, and the request inactive if nothing is live;
  - a repeat → `replayed`, with no new event, replacement or incident;
  - another goalkeeper's booking → `booking_not_found`; a pending, cancelled or expired booking → `not_withdrawable`; `now ≥ startsAt` → `match_started`; a reason of 201 characters → `invalid_reason`;
  - **a race**: the client cancels first → `not_withdrawable { status: 'cancelled' }` and a refund, with no incident; the withdrawal first → the client gets `not_cancellable`, with no refund.
- [X] T022 [P] [US1] HTTP `tests/http/controllers/goalkeeperWithdraw.test.ts`:
  - G accepts at `MATCH_NOW` and withdraws → `200` with `status: 'goalkeeper_withdrew'` and `withdrawal.replacementCreated: true`;
  - G's wallet is unchanged;
  - the client's `GET /api/goalkeeper-requests/bookings` shows the withdrawn booking and a pending one;
  - H's available matches list the replacement, G's don't;
  - H's inbox has the offer, and the client's has `booking.goalkeeper_withdrew`;
  - G accepting the replacement → `404 booking_not_available`;
  - a repeat → `200`;
  - clock at 19:45Z → `replacementCreated: false`;
  - 20:00Z → `409 match_started`;
  - an unassigned booking → `409 booking_not_withdrawable`;
  - a client token → refused.

**Checkpoint**: SC-001, SC-001a, SC-004 (withdrawals) and SC-005.

---

## Phase 4: User Story 2 - Late or repeated withdrawals suspend the goalkeeper (Priority: P1)

**Goal**: The penalty policy applied in the transaction, with the country values. Suspensions never add up, they have the same effect as 012 and 015's, and there's a suspension notice.

**Independent Test**: 90 min before → suspended 3 days (available matches say `suspended`). 5 h before → not suspended. The 3rd in 7 days → 7 days. A late 3rd → the latest end.

- [X] T023 [P] [US2] Unit tests in `withdrawFromBooking.test.ts` (penalties):
  - 90 min → a `late` penalty, `suspendedUntil = now + 3 d`, and the profile updated;
  - exactly 120 min → none;
  - three in-time withdrawals within 7 days → the 3rd has a `weekly_limit` penalty of 7 d;
  - 8 days apart → no limit;
  - a late 3rd → two penalties, `suspendedUntil` = the later end (7 d), not 10 d;
  - a withdrawal while suspended → the end is `max`;
  - config from `bookingSettings` (e.g. a 60-minute threshold) honoured; config absent → defaults, with the warning logged;
  - the suspension notice: exactly 1 `goalkeeper.suspended` with the local end date; none for an in-time withdrawal;
  - after suspension: `OfferEligibilityService.availableBookingsFor(G)` → `unavailable/suspended`; accept → `suspended`;
  - **a race**: two withdrawals of the same goalkeeper through the fake → the second sees the first in its count.
- [X] T024 [P] [US2] HTTP in `goalkeeperWithdraw.test.ts` (penalties):
  - a late withdrawal → `withdrawal.late: true`, one penalty, `suspendedUntil`;
  - `GET /me/available-bookings` → `unavailableReason: 'suspended'`;
  - accepting another booking → `403 goalkeeper_suspended`;
  - G's inbox has `goalkeeper.suspended`.

**Checkpoint**: SC-002, SC-003 and FR-013/FR-014.

---

## Phase 5: User Story 3 - Every withdrawal and penalty is on record (Priority: P2)

**Goal**: The goalkeeper lists their own withdrawals and penalties, paginated and newest first.

**Independent Test**: After two withdrawals (one late), `GET /me/withdrawals` lists both, the late one with its 3-day penalty.

- [X] T025 [US3] `src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/`:
  - `ListGoalkeeperWithdrawalsQuery(goalkeeperId, page, pageSize, view: 'goalkeeper' | 'admin')`;
  - result `{ outcome: 'ok'; items; page; pageSize; totalItems; totalPages; suspendedUntil }` | `{ outcome: 'not_a_goalkeeper' }`;
  - uses `IGoalkeeperIncidentRepository` and `toWithdrawalItem`, where the admin view includes `by`.

  Register it. Unit tests in `tests/unit/application/features/bookingLifecycle/listGoalkeeperWithdrawals.test.ts`: order, paging, the two views, and a non-goalkeeper.
- [X] T026 [US3] `GET /me/withdrawals?page&pageSize` in `src/controllers/goalkeeperController.ts`: paging (page ≥ 1, pageSize 1–50, default 20) with the existing `listClientBookingsRequestSchema`, through a shared `src/controllers/withdrawals/withdrawalsHttp.ts` also used by the admin route, and an exhaustive mapping. HTTP tests in `goalkeeperWithdraw.test.ts`:
  - two withdrawals → 2 items, newest first, with the penalties;
  - a client token → refused.

**Checkpoint**: FR-015/FR-016.

---

## Phase 6: User Story 4 - An administrator reverses a penalty (Priority: P2)

**Goal**: Reverse the money (one commission refund by the admin) and/or lift the suspensions, with a mandatory reason. `suspendedUntil` is recomputed immediately, the withdrawal is forgiven for later counts, and the operation is idempotent and admin-only.

**Independent Test**: Reverse money and suspension of a late withdrawal → the balance goes up by the commission, `suspendedUntil: null`, and G sees matches again. Repeat → no change.

- [X] T027 [US4] `src/application/features/wallet/common/walletLedger.ts`: `commissionRefundDraft` accepts an optional `actor` (default the system). `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`: `refundCommissionInSession` passes an optional `actor`. Unit test: the admin actor.
- [X] T028 [US4] `reverseWithdrawal` per research §9, in one transaction, in `src/infrastructure/persistence/mongo/bookingLifecycleStore.ts` and `tests/fakes/fakeBookingLifecycleStore.ts`:
  - read the incident (`_id`, `goalkeeperId`), else `not_found`;
  - `refund` and no `moneyReversal` → `refundCommissionInSession` (cancellation `{ by: 'admin', at, reason }`, admin actor) and set `moneyReversal`;
  - `liftSuspension` → set the `reversal` of every unreversed penalty;
  - anything changed → `forgivenAt ??= now`, recompute `suspendedUntil`, and write the profile. Otherwise → `replayed`;
  - `missing_charge` aborts without writes.

  Mongo tests in `bookingLifecycleStore.test.ts`.
- [X] T029 [US4] `src/application/features/bookingLifecycle/commands/reverseWithdrawalPenalty/`:
  - `ReverseWithdrawalPenaltyCommand(adminId, goalkeeperId, withdrawalId, refund, liftSuspension, reason)`;
  - result: `{ outcome: 'reversed' | 'replayed'; withdrawal; suspendedUntil }` | `{ outcome: 'not_a_goalkeeper' | 'withdrawal_not_found' | 'invalid_request' }` | `{ outcome: 'wallet_not_configured'; cityId }` | `{ outcome: 'missing_charge'; bookingId }`.
  - The handler validates (a trimmed reason of 3–500 characters, at least one action), resolves the owner when `refund` (`resolveGoalkeeperWalletContext`), calls the store, and audits `logPenaltyReversal`.

  Unit tests in `tests/unit/application/features/bookingLifecycle/reverseWithdrawalPenalty.test.ts`:
  - money only → one refund with `actor.kind: 'admin'` and the reason, and the suspension kept;
  - suspension only → `suspendedUntil` recomputed to the next penalty in force, or `null`;
  - a repeat → `replayed`, no second refund;
  - the money already refunded by another path → no second refund;
  - a missing or too short reason, or no action → `invalid_request`;
  - another goalkeeper's withdrawal → `withdrawal_not_found`;
  - **forgiveness**: withdrawals 1 and 2, then 1 reversed, then a 3rd → no `weekly_limit` penalty (clarification 2).
- [X] T030 [US4] Admin endpoints in `src/controllers/adminController.ts`:
  - `GET /goalkeepers/:userId/withdrawals` (the US3 query with `view: 'admin'`);
  - `POST /goalkeepers/:userId/withdrawals/:withdrawalId/reversal`, with zod `{ refund: boolean = false, liftSuspension: boolean = false, reason: string trim 3–500 }` plus a refine (at least one) in `src/controllers/requests/withdrawals/reverseWithdrawalRequest.ts`;
  - an exhaustive mapping per contracts §3–§4.

  Register the command. HTTP tests in `tests/http/controllers/adminWithdrawals.test.ts`:
  - a late withdrawal → the admin reverses both → `200`, G's balance goes back up by 7000, `suspendedUntil: null`, and G's available matches no longer say `suspended`;
  - a repeat → `200`, and the balance is unchanged;
  - no reason → `400`;
  - a goalkeeper token → `403`;
  - an unknown id → `404 withdrawal_not_found`;
  - the admin list shows `by`.

**Checkpoint**: SC-004 (reversals), SC-006, and FR-017–FR-022.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T031 [P] `src/infrastructure/openapi/openapiSpec.ts`: the 4 paths (bodies, responses, bearer or admin security), the `goalkeeper_withdrew` status, and the withdrawal schemas. `docs/push-notifications.md`: the two new notice types and the offer renewal. Assert the paths in the HTTP tests.
- [X] T032 [P] Add "12. Retiro del portero y penalidades (spec 018)" to `_temp_pruebas.md`, from quickstart §1–§6, in Spanish (steps and expected results).
- [X] T033 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure, including 015/016/017 tests whose expectations change for the new fields (quote and booking documents, sweep and consumer lists).
- [ ] T034 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §12): the dev-cluster walk-through, the withdraw-vs-client-cancel concurrency, and the renewed offer on a real device.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** → **US4** → **Polish**.
- US2 needs US1's command, since the penalties are computed in the same transaction and are already in place after Phase 2. It only adds tests and the suspension notice path.
- US3 is independent of US2 in code, but its tests use late withdrawals.
- US4 needs US3's query (for the admin list and the response item).

### Parallel opportunities

- **Phase 2**:
  1. T002 ∥ T003 ∥ T004 ∥ T005 ∥ T006 ∥ T007 ∥ T008;
  2. then T009;
  3. then T010 ∥ T011 ∥ T012 ∥ T013 ∥ T014. T011 and T012 are different files: the store and the fake.
- **US1**:
  1. T015;
  2. then T016 ∥ T017 ∥ T018 ∥ T019;
  3. then T020;
  4. then T021 ∥ T022.
- **US2**: T023 ∥ T024.
- **US3**: T025, then T026.
- **US4**:
  1. T027;
  2. then T028;
  3. then T029;
  4. then T030.
- **Polish**: T031 ∥ T032.

## Implementation Strategy

1. **Phase 1–2**: the domain, the policy, the store transaction and the fakes, green.
2. **US1**: the MVP. Withdrawal, the replacement found automatically, the client told.
3. **US2**: the penalties visible end to end.
4. **US3**: the history.
5. **US4**: the admin reversal and forgiveness.
6. **Polish**.

## Notes

- **Refusals never write**: every refusal is decided inside the transaction before its first write.
- **No refund on withdrawal**. The only refund path is the admin's reversal, with the shared `commission_refund:{bookingId}` key.
- **One replacement per withdrawn booking**, and the goalkeeper who withdrew never sees it.
- **Suspensions never add up**: `suspendedUntil` is always the latest end among the penalties in force.
