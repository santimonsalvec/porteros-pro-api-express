# Implementation Plan: Booking Expiry and "Cancel All"

**Branch**: `016-booking-expiry-cancel-all` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-booking-expiry-cancel-all/spec.md`

## Summary

Two scheduled jobs on 013's every-minute sweep:

- **`cancel-all`**: finds "cancel all" requests at or past start − their free-cancellation period and not yet evaluated. Per request, one transaction:
  1. claims the evaluation (`cancelAllEvaluatedAt`, exactly-once gate);
  2. if everything is assigned, keeps it (firm);
  3. otherwise cancels every pending or assigned booking, refunds each charged commission (`causeKey: commission_refund:{bookingId}` (the key 011's `refundCommission` already uses, so 016 and 017 can never refund one booking twice), cancellation by the system, reason "cancel all") and records the `booking.cancelled` events;
  4. deactivates the request.
- **`booking-expiry`**: expires every pending booking past its search end, one transaction per request. It records `booking.expired` events and deactivates the request when nothing is left pending or assigned.

Both publish their events through 013's relay. Acceptance (012) races are resolved by MongoDB write conflicts on the booking document: exactly one outcome.

**Notices** are idempotent event consumers. They create one inbox entry per request outcome (client) or per cancelled booking (goalkeeper), keyed by a new unique `dedupeKey`, and push only when they created it.

**Clarification 1**: the quote gains `cancelAllAvailable` / `cancelAllUntil`, and the confirmation refuses late `cancel_all` with `409 cancel_all_not_available`.

The request status gains `expired` and `cancelled`.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused: 013 (sweep jobs, outbox, relay, consumers), 011 (ledger, `appendMovementInSession`), 014 and 015 (push, inbox). No new dependency.
**Storage**: MongoDB (Atlas, transactions). No new collection.
- New fields: `bookings.endedAt`, `endReason`, `cancelledBy`; `goalkeeperRequests.cancelAllEvaluatedAt`; `notifications.dedupeKey`.
- New indexes: `goalkeeperRequests.cancelAll_due`, `notifications.dedupe_unique`.

See [data-model.md](./data-model.md).
**Testing**: Vitest tiers as in 008–015:
- unit: status derivation, event factories, refund draft, the jobs with fakes (including concurrent runs), the stores on mocked collections plus a mocked `withTransaction`, the consumers;
- HTTP: sweep → expiry and cancel-all end to end (`eventsMode: 'local'`), the quote flag and the confirmation refusal, the request views and the agenda.

Concurrency against the real cluster is manual (quickstart §4).
**Target Platform**: Firebase App Hosting plus the 013 sweep (local timer or Cloud Scheduler).
**Project Type**: Single backend web service.
**Performance Goals**: transitions ≤ 2 minutes after their time (SC-001, SC-002); up to 500 items per job per sweep.
**Constraints**:
- exactly-once transitions, refunds and notices;
- all-or-nothing request cancellation;
- acceptance vs. transition resolves to one outcome.

**Scale/Scope**: At most tens of transitions per minute today.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the template. The plan follows the 001–015 discipline:
- **Layering**:
  - domain: status, event factories, the refund draft;
  - application: the jobs, the consumers and the command changes, behind ports (`IBookingLifecycleStore`);
  - infrastructure: the Mongo transactions.
- **CQRS and exhaustive mappings.**
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes. The cross-feature touches are deliberate and covered by extended tests:
- 010: quote flag, confirmation refusal, status derivation;
- 011: the shared refund draft;
- 013: event types and schemas;
- 015: inbox `dedupeKey`.

## Project Structure

### Documentation (this feature)

```text
specs/016-booking-expiry-cancel-all/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/lifecycle-changes.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/booking.ts                      # MODIFIED: endedAt, endReason, cancelledBy
│   ├── bookings/goalkeeperRequest.ts            # MODIFIED: cancelAllEvaluatedAt; cancelAllUntil()
│   ├── bookings/requestStatus.ts                # MODIFIED: 'cancelled', 'expired'
│   ├── events/domainEvent.ts                    # MODIFIED: 'booking.expired' | 'booking.cancelled'
│   ├── events/bookingEvents.ts                  # MODIFIED: bookingExpired(), bookingCancelled()
│   └── notifications/outcomeMessages.ts         # NEW: client + goalkeeper notice texts (reuses localWhen)
│
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/ports.ts                      # NEW: IBookingLifecycleStore
│   │   ├── jobs/bookingExpiryJob.ts             # NEW: IScheduledJob 'booking-expiry'
│   │   ├── jobs/cancelAllJob.ts                 # NEW: IScheduledJob 'cancel-all'
│   │   └── handlers/
│   │       ├── clientOutcomeNoticeHandler.ts    # NEW: booking.expired / booking.cancelled → client
│   │       └── goalkeeperCancellationNoticeHandler.ts  # NEW: booking.cancelled → goalkeeper
│   ├── wallet/common/walletLedger.ts            # MODIFIED: export commissionRefundDraft (used by refundCommission too)
│   ├── events/common/eventSchemas.ts            # MODIFIED: schemas for the 2 new types
│   ├── events/handlers/logEventDelivery.ts      # MODIFIED: DELIVERY_LOG_EVENT_TYPES += new types
│   ├── notifications/common/ports.ts            # MODIFIED: createIfAbsent(dedupeKey)
│   └── goalkeeperRequests/
│       ├── common/ports.ts                      # MODIFIED: findDueForExpiry, findDueForCancelAll
│       ├── commands/issueServiceQuote/…         # MODIFIED: cancelAllAvailable / cancelAllUntil
│       └── commands/confirmBooking/…            # MODIFIED: outcome cancel_all_not_available
│
├── infrastructure/
│   ├── persistence/mongo/bookingLifecycleStore.ts   # NEW: expire() and cancelAll() transactions
│   ├── persistence/mongo/bookingRepository.ts       # MODIFIED: new fields, findDueForExpiry
│   ├── persistence/mongo/goalkeeperRequestRepository.ts  # MODIFIED: cancelAllEvaluatedAt, findDueForCancelAll, index
│   ├── persistence/mongo/notificationRepository.ts  # MODIFIED: createIfAbsent + dedupe_unique index
│   ├── openapi/openapiSpec.ts                        # MODIFIED: quote fields, 409, statuses
│   └── di.ts                                        # MODIFIED: store, jobs (before offer-reminders), consumers
└── controllers/goalkeeperRequestsController.ts      # MODIFIED: map cancel_all_not_available → 409

tests/ (fakes: FakeBookingLifecycleStore; unit + http per Technical Context)
docs/push-notifications.md                           # MODIFIED: the 4 new data.type values
```

**Structure Decision**:
- A new `bookingLifecycle` application slice owns time-driven transitions and their notices. 017 (client cancellation) and 018 (withdrawal) add their commands and notices there.
- Mongo transactions live in one `MongoBookingLifecycleStore`, next to 012's acceptance store.

## Implementation notes

- **Relay**: both jobs call `relay.relay(events)` after each committed request, as handlers do in 013. In local mode, the consumers (notices) run right there.
- **Owner resolution before cancel-all**: `resolveGoalkeeperWalletContext` for each assigned goalkeeper. `wallet_not_configured` → skip the request, log `cancel_all_skipped`, retry next sweep.
- **Charge lookup inside the transaction**: `walletMovements.findOne({ causeKey: 'commission:' + bookingId }, { session })`. A missing charge (data inconsistency) aborts the request and logs it; there's never a refund without a charge.
- **Acceptance outcome after cancellation**: 012's `classify()` maps `cancelled` → `not_available`, and `expired` → `not_available` (its search also ended → `search_ended`). No change is needed.
- **The fakes** mirror the transactions' conditional semantics, so the jobs' exactly-once tests, including two concurrent `run()` calls, pass on fakes.

## Complexity Tracking

*No entries.*
