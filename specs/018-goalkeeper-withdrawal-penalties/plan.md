# Implementation Plan: Goalkeeper Withdrawal, Penalties and Suspensions

**Branch**: `018-goalkeeper-withdrawal-penalties` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-goalkeeper-withdrawal-penalties/spec.md`

## Summary

**The goalkeeper withdraws.** `POST /api/goalkeepers/me/bookings/{bookingId}/withdraw` sends `WithdrawFromBookingCommand`. The handler resolves the goalkeeper's country penalty config (bookingSettings, with Colombia defaults), then calls a new `withdraw` transaction in 016's `MongoBookingLifecycleStore`. In one transaction, it:
- marks the booking `goalkeeper_withdrew`, with no refund;
- **creates a replacement booking** in the same request if the search is still open (clarification 3): same price, commission and search end, excluding the goalkeeper;
- applies the reusable **penalty policy** (late < 2 h → 3 days; the 3rd in 7 days → 7 days; reversed withdrawals don't count);
- records a `goalkeeperIncidents` document with its embedded penalties;
- recomputes `goalkeeperProfiles.suspendedUntil` as the latest end in force (clarification 1);
- records the `goalkeeper.withdrew` and `booking.created` events.

**After the commit**, the relay publishes the events:
- 015's offer command sends the replacement in a new `renew` mode, which reopens each eligible goalkeeper's offer for the request;
- a new `WithdrawalNoticeHandler` tells the client ("ya estamos buscando otro" or "no alcanzamos"), and tells the goalkeeper when they're suspended.

**History and administration**: the goalkeeper and the administrators list withdrawals. An administrator **reverses** a withdrawal in another lifecycle transaction:
- the money: a commission refund with the shared `commission_refund:{bookingId}` key;
- and/or the suspensions: they're lifted, and `suspendedUntil` is recomputed;
- either way, the withdrawal is forgiven for later weekly counts.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused:
- 016's lifecycle store and notices;
- 017's note normalization;
- 011's refund draft and wallet context;
- 015's eligibility and `OfferSender`;
- 013's relay and consumers.

No new dependency.
**Storage**: MongoDB (Atlas, transactions). A new collection, `goalkeeperIncidents` (indexes `goalkeeper_occurred`, `kind_booking_unique`). New fields:
- `bookings.replacesBookingId` and `bookings.excludedGoalkeeperIds`;
- `goalkeeperProfiles.penaltiesUpdatedAt`;
- `bookingSettings.goalkeeperPenalties` (country scope).

Offer entries become renewable. See [data-model.md](./data-model.md).
**Testing**: As 016 and 017:
- **unit**:
  - the penalty policy (every boundary: exactly 2 h, the 3rd in the window, forgiven incidents, overlap);
  - `suspensionEndOf`, `Booking.replacementFor`, and `isEligible` with exclusion;
  - the command handlers (withdraw, list, reverse);
  - the fake store's conditional semantics (withdrawal vs. client cancellation, two withdrawals of the same goalkeeper);
  - the Mongo store on mocked collections;
  - offer renewal and the notice wording;
  - 016's "cancel all" ignoring withdrawn bookings, and the outcome key after a replacement;
- **HTTP**: every row of the contract, plus the end-to-end replacement flow in `local` events mode.

**Target Platform**: Firebase App Hosting.
**Project Type**: Single backend web service.
**Performance Goals**: A withdrawal answers like any write (one transaction). The client notice and the replacement offers go out within the 2 s relay (SC-001, SC-001a).
**Constraints**:
- all or nothing;
- no refund on withdrawal;
- at most one replacement per withdrawn booking;
- suspensions never add up;
- idempotent withdrawals and reversals;
- the goalkeeper who withdrew never sees their replacement.

**Scale/Scope**: Occasional, goalkeeper-driven. The history is paginated.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–017 discipline applies:
- **Layering**:
  - the penalty policy, `suspensionEndOf`, the incident entity and the replacement factory in the domain;
  - the commands and queries in the application, behind `IBookingLifecycleStore` and `IGoalkeeperIncidentRepository`;
  - the transactions in infrastructure.
- **CQRS and exhaustive mappings** in the controllers.
- **Fakes, no real resources** in tests.
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits are deliberate and covered by extended tests of their features:
- 015's `isEligible` exclusion, the `renew` send mode and `renewOffer`;
- 016's "cancel all" filter and outcome dedupe key;
- 011's refund draft actor;
- 012's accept `classify`.

## Project Structure

### Documentation (this feature)

```text
specs/018-goalkeeper-withdrawal-penalties/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/withdrawals.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/booking.ts                          # MODIFIED: endReason/cancelledBy values, replacesBookingId, excludedGoalkeeperIds, replacementFor(), withdrawalNoticeMinutes()
│   ├── bookings/offerEligibility.ts                 # MODIFIED: excluded goalkeepers are never eligible
│   ├── goalkeepers/goalkeeperIncident.ts            # NEW: incident + penalties entity, suspensionEndOf()
│   ├── goalkeepers/penaltyPolicy.ts                 # NEW: penaltiesFor(), GoalkeeperPenaltyConfig, DEFAULT_GOALKEEPER_PENALTIES
│   ├── pricing/bookingSettings.ts                   # MODIFIED: goalkeeperPenalties (validated)
│   ├── events/bookingEvents.ts                      # MODIFIED: goalkeeperWithdrew(); booking.created replacesBookingId
│   └── notifications/withdrawalMessages.ts          # NEW: client (replacement / none) and suspension texts
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/ports.ts                          # MODIFIED: withdraw, reverseWithdrawal, IGoalkeeperIncidentRepository, results
│   │   ├── common/penaltyConfig.ts                  # NEW: resolve the country's config (defaults + warning)
│   │   ├── common/withdrawalResponses.ts            # NEW: incident → API item (goalkeeper / admin views)
│   │   ├── commands/withdrawFromBooking/            # NEW: command + handler (config → store → relay → audit)
│   │   ├── commands/reverseWithdrawalPenalty/       # NEW: command + handler (owner → store → audit)
│   │   ├── queries/listGoalkeeperWithdrawals/       # NEW: query + handler (goalkeeper and admin)
│   │   └── handlers/
│   │       ├── withdrawalNoticeHandler.ts           # NEW: client + suspension notices on goalkeeper.withdrew
│   │       └── clientOutcomeNoticeHandler.ts        # MODIFIED: ignore withdrawn bookings; key per latest replacement
│   ├── notifications/
│   │   ├── common/offerSender.ts                    # MODIFIED: 'renew' mode
│   │   ├── common/ports.ts                          # MODIFIED: renewOffer
│   │   └── commands/notifyBookingOffers/…Handler.ts # MODIFIED: replacement → 'renew'
│   ├── goalkeeperRequests/commands/acceptBooking/…Handler.ts  # MODIFIED: excluded → not_available
│   ├── wallet/common/walletLedger.ts                # MODIFIED: commissionRefundDraft optional actor
│   └── events/common/eventSchemas.ts                # MODIFIED: goalkeeper.withdrew; booking.created replacesBookingId
├── infrastructure/
│   ├── persistence/mongo/bookingLifecycleStore.ts   # MODIFIED: withdraw, reverseWithdrawal; cancelAll ignores withdrawn
│   ├── persistence/mongo/goalkeeperIncidentRepository.ts  # NEW: collection, mapping, indexes, list
│   ├── persistence/mongo/bookingRepository.ts       # MODIFIED: new fields mapping
│   ├── persistence/mongo/bookingSettingsRepository.ts     # MODIFIED: goalkeeperPenalties mapping
│   ├── persistence/mongo/notificationRepository.ts  # MODIFIED: renewOffer
│   ├── persistence/mongo/goalkeeperProfileRepository.ts   # MODIFIED: penaltiesUpdatedAt ignored on read
│   ├── observability/pinoAuditLogger.ts             # MODIFIED: logWithdrawal, logPenaltyReversal
│   ├── openapi/openapiSpec.ts                       # MODIFIED: 4 paths, schemas
│   └── di.ts                                        # MODIFIED: register commands/query/handler, indexes
└── controllers/
    ├── goalkeeperController.ts                      # MODIFIED: withdraw + own history, exhaustive mapping
    ├── adminController.ts                           # MODIFIED: history + reversal
    └── requests/withdrawals/                        # NEW: zod { reason? }, reversal { refund, liftSuspension, reason }, paging

tests/
├── unit/domain/…                                    # policy, incident, booking replacement, eligibility exclusion, messages
├── unit/application/features/bookingLifecycle/     # lifecycleHarness extended: fake withdraw/reverse, incidents, profiles
├── unit/infrastructure/…                            # Mongo store/repository on mocked collections
└── http/withdrawals.http.test.ts                    # contract rows + replacement end-to-end (local events)
```

**Structure Decision**: Everything goes in 016's `bookingLifecycle` slice. A withdrawal is a lifecycle transition, next to expiry, "cancel all" and the client's cancellation, and 021's no-show will join it. The penalty policy is domain code under `goalkeepers/`, since it's about the goalkeeper and not the booking, so 021 reuses it directly.

## Implementation notes

- **Withdraw handler flow**:
  1. check the goalkeeper's profile, else `not_a_goalkeeper`;
  2. `resolvePenaltyConfig` (wallet context → countryId → `bookingSettings.findFor` → defaults and a warning);
  3. `normalizeCancellationNote(reason)`;
  4. `store.withdraw({ bookingId, goalkeeperId, now, note, config, newId, buildEvents })`;
  5. on `withdrawn`, `relay.relay(events)`;
  6. answer with `toAgendaItem` (012) and the `withdrawal` summary;
  7. `audit.logWithdrawal` for every outcome.
- **Fake store** (`lifecycleHarness`): holds the incidents and profile suspensions next to the bookings, with the same synchronous check-then-write as 016 and 017. The concurrency tests race `withdraw` against `cancelByClient`, and two `withdraw` calls of the same goalkeeper.
- **Window boundary**: `occurredAt > now − windowDays` (strict), counting the current incident (`recentCount + 1`).
- **Time zone** of the suspension notice: the match's (`request.match.timeZone`), taken from the event's request.
- **HTTP harness**: `MATCH_NOW` 18:30Z, match at 20:00Z → 90 minutes' notice (late) and search end 19:30Z (replacement created). To get a withdrawal without a replacement, move the clock past 19:30Z.

## Complexity Tracking

*No entries.*
