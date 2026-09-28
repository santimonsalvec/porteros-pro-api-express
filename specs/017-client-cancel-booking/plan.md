# Implementation Plan: Client Cancels Bookings

**Branch**: `017-client-cancel-booking` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-client-cancel-booking/spec.md`

## Summary

**Two client endpoints** on the existing client router:
- cancel one booking: `POST …/bookings/{requestId}/bookings/{bookingId}/cancel`;
- cancel the whole request: `POST …/bookings/{requestId}/cancel`.

Both send `CancelBookingsByClientCommand`. The command resolves the ledger owners of the assigned goalkeepers, then calls a new `cancelByClient` transaction in 016's `MongoBookingLifecycleStore`:
- it checks ownership and the targets;
- it refuses the whole operation if any assigned target is past start − free-cancellation period (clarification 1);
- otherwise it cancels every target (`cancelledBy: 'client'`, reason note), refunds each assigned goalkeeper through a shared refund helper (the same `commission_refund:{bookingId}` key as 016, so one refund per booking whatever path), records `booking.cancelled` events and deactivates a request left with nothing live.

The relay publishes the events.

**016's changes**:
- the goalkeeper notice gets "El cliente canceló…" wording;
- the client-outcome notice ignores client cancellations;
- "cancel all" evaluates only the bookings the client didn't cancel (clarification 3).

Races with acceptance resolve through write conflicts, as in 016.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused: 016's lifecycle store and notices, 011's refund draft, 013's relay. No new dependency.
**Storage**: MongoDB. No new collection or index. `bookings` gains `cancellationNote`; `endReason` and `cancelledBy` gain values. See [data-model.md](./data-model.md).
**Testing**: As 016:
- unit: the command, the store transaction on mocked collections, the fake store's conditional semantics (concurrent calls), the notice wording and exclusions, "cancel all" ignoring client-cancelled bookings;
- HTTP: every row of the contract.
**Target Platform**: Firebase App Hosting.
**Project Type**: Single backend web service.
**Performance Goals**: A cancellation answers like any write (one transaction).
**Constraints**:
- all or nothing;
- one refund per booking;
- the whole request is refused inside the last period;
- idempotent.

**Scale/Scope**: Occasional, client-driven.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–016 discipline applies:
- **Layering**: rules in the domain, the command in the application behind `IBookingLifecycleStore`, the transaction in infrastructure.
- **CQRS and exhaustive mappings.**
- **Fakes, no real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits to 016 are deliberate:
- the notices;
- the "cancel all" exclusion;
- the extracted refund helper.

They are covered by extended 016 tests.

## Project Structure

### Documentation (this feature)

```text
specs/017-client-cancel-booking/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/client-cancel.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/booking.ts                     # MODIFIED: endReason 'client_cancelled', cancelledBy 'client', cancellationNote
│   ├── events/bookingEvents.ts                 # MODIFIED: bookingCancelled(…, { reason, by })
│   └── notifications/outcomeMessages.ts        # MODIFIED: bookingCancelledMessage(…, by)
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/ports.ts                     # MODIFIED: cancelByClient + ClientCancelResult
│   │   ├── commands/cancelBookingsByClient/    # NEW: command + handler (owners → store → relay → audit)
│   │   └── handlers/
│   │       ├── clientOutcomeNoticeHandler.ts   # MODIFIED: skip by:'client'; outcomes over non-client-cancelled bookings
│   │       └── goalkeeperCancellationNoticeHandler.ts  # MODIFIED: wording by author
│   └── events/common/eventSchemas.ts           # MODIFIED: reason/by unions
├── infrastructure/
│   ├── persistence/mongo/bookingLifecycleStore.ts  # MODIFIED: cancelByClient; refundCommissionInSession extracted; cancelAll excludes client-cancelled
│   ├── persistence/mongo/bookingRepository.ts      # MODIFIED: cancellationNote mapping
│   ├── openapi/openapiSpec.ts                      # MODIFIED: 2 paths
│   └── di.ts                                       # MODIFIED: register the command
└── controllers/
    ├── goalkeeperRequestsController.ts         # MODIFIED: 2 routes, exhaustive mapping
    └── requests/goalkeeperRequests/cancelRequest.ts  # NEW: zod { reason? }

tests/ (fake store extended; unit + http as in Technical Context)
```

**Structure Decision**: The command lives in 016's `bookingLifecycle` slice, next to the jobs, as 016's plan anticipated.

## Implementation notes

- **Handler flow**:
  1. read the request's bookings (`findByRequestIds`);
  2. resolve the owners of the currently assigned goalkeepers;
  3. `store.cancelByClient(...)`;
  4. on `owner_required`, resolve it and retry once;
  5. map the outcome;
  6. on `cancelled`, `relay.relay(events)`;
  7. answer with `toRequestResponse(request, bookingsNow, now, contacts)` (reuse 010's `replay`-style loader).
- **Audit**: `logBookingConfirmation` is typed for confirmations. Add a small `logClientCancellation({ outcome, clientId, requestId, bookingId? })` to `IBookingAuditLogger` (Pino and fake) rather than overloading it.
- **Last-period boundary**: `request.canCancelFreeAt(now)` (inclusive), the same instant 016's "cancel all" and clarification 1 use, and the client's view (`cancellation.freeCancellationAvailable`).

## Complexity Tracking

*No entries.*
