# Implementation Plan: Goalkeeper Check-in with Photo

**Branch**: `020-goalkeeper-check-in` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-goalkeeper-check-in/spec.md`

## Summary

**The check-in**: the goalkeeper uploads the photo with the existing image endpoint (002), then calls `POST /api/goalkeepers/me/bookings/{id}/check-in` with the `imageId` and an optional location. A new `checkIn` transaction in the lifecycle store does four things:
- checks ownership and the window (start − 30 / start + 15 per country, inclusive, platform clock);
- records `bookings.checkIn` once (time, photo, location, distance to the pitch);
- appends `goalkeeper.checked_in`, whose consumer tells the client "tu portero llegó";
- answers a repeat with the recorded check-in.

**The views**: the client's request shows `checkIn { at, photoUrl }`, without location. The goalkeeper's agenda also shows the distance.

**The `check-in-watch` sweep job**, every minute, via 019's `notifyOnce`:
- reminds the goalkeeper when the window opens, and at close − 10 min if they haven't checked in;
- tells the client at close with the goalkeeper's WhatsApp if there's no check-in. That sets `checkInMissedAt`, which 021 will read.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused:
- 002: image upload and validation;
- 013: outbox, consumers and sweep;
- 019: `notifyOnce` and the contact rules;
- 016–018: the lifecycle store.

No new dependency.
**Storage**: MongoDB. No new collection. `bookings` gains `checkIn`, `checkInOpenNoticeAt`, `checkInLastCallAt` and `checkInMissedAt`, plus the index `status_startsAt`. `bookingSettings` gains `checkInWindow`. See [data-model.md](./data-model.md).
**Testing**: As 016–019.
- **Unit**:
  - `CheckInWindow` boundaries and `distanceMeters`;
  - the settings validation and the window resolver;
  - the command (every outcome, repeat after close, race with a withdrawal through the fake);
  - the Mongo store transaction on mocked collections;
  - the consumer;
  - the job (open, last call, missed, exactly once, not after close or end, assigned inside the window);
  - the messages.
- **HTTP**: the contract rows, the client and goalkeeper views, the notices end to end in `local` events mode, and the sweep.

**Target Platform**: Firebase App Hosting.
**Project Type**: Single backend web service.
**Performance Goals**:
- the check-in answers like any write, and the client notice goes out within the 2 s relay;
- the reminders and the missed notice land within one sweep (SC-004, SC-006).

**Constraints**:
- no check-in after the window;
- the location never blocks;
- the client never sees the location;
- one of each notice per booking.

**Scale/Scope**: At most 4 notices per booking.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–019 discipline applies:
- **Layering**: window, distance and messages in the domain; the command, consumer and job in the application behind ports; the transaction and queries in infrastructure.
- **CQRS and exhaustive mappings.**
- **Fakes, no real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits are deliberate and covered by updated tests:
- 019's response builders;
- the sweep job list;
- `bookingSettings`.

## Project Structure

### Documentation (this feature)

```text
specs/020-goalkeeper-check-in/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/check-in.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/booking.ts                       # MODIFIED: checkIn + three notice marks
│   ├── bookings/checkInWindow.ts                 # NEW: window (opens, last call, closes), distanceMeters
│   ├── pricing/bookingSettings.ts                # MODIFIED: checkInWindow (validated)
│   ├── events/bookingEvents.ts, domainEvent.ts   # MODIFIED: goalkeeper.checked_in
│   └── notifications/checkInMessages.ts          # NEW: 4 messages
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/ports.ts                       # MODIFIED: checkIn + CheckInResult
│   │   ├── common/checkInWindowResolver.ts       # NEW: country values + defaults (cached per city)
│   │   ├── commands/checkInToBooking/            # NEW: command + handler
│   │   ├── handlers/checkInNoticeHandler.ts      # NEW: client "arrived"
│   │   └── jobs/checkInWatchJob.ts               # NEW: open / last call / missed
│   ├── goalkeeperRequests/common/requestResponse.ts, goalkeeperBookingResponse.ts  # MODIFIED: checkIn in views
│   ├── goalkeeperRequests/common/ports.ts        # MODIFIED: findForCheckInWatch, markCheckInNotice, logCheckIn
│   └── events/common/eventSchemas.ts, handlers/logEventDelivery.ts  # MODIFIED: new event
├── infrastructure/
│   ├── persistence/mongo/bookingLifecycleStore.ts  # MODIFIED: checkIn transaction
│   ├── persistence/mongo/bookingRepository.ts      # MODIFIED: fields, index, 2 methods
│   ├── persistence/mongo/bookingSettingsRepository.ts  # MODIFIED: checkInWindow
│   ├── observability/pinoAuditLogger.ts            # MODIFIED: logCheckIn
│   ├── openapi/openapiSpec.ts                      # MODIFIED: path + fields
│   └── di.ts                                       # MODIFIED: command, consumer, job
└── controllers/
    ├── goalkeeperController.ts                   # MODIFIED: check-in route
    └── requests/checkIn/checkInRequest.ts        # NEW: zod body
tests/ (fakes extended; unit + http as in Technical Context)
docs/push-notifications.md                        # MODIFIED: 4 types
```

**Structure Decision**: The check-in is a lifecycle transition of the booking, like acceptance (012), cancellation (017) and withdrawal (018), so it goes in the `bookingLifecycle` slice with its job and consumer.

## Implementation notes

- **Handler flow**:
  1. check the profile, else `not_a_goalkeeper`;
  2. load the image and require `uploadedBy === goalkeeperId`, else `invalid_photo`;
  3. load the booking and its request (the pitch point and city);
  4. `resolveCheckInWindow`;
  5. `store.checkIn`;
  6. relay;
  7. answer `toAgendaItem`;
  8. audit.
- **Job order**: `cancel-all`, `booking-expiry`, `offer-reminders`, `contacts-reveal`, `check-in-watch`.
- **The last call**: at `closesAt − 10 min`, but never before `opensAt` (for very short configured windows).
- **Existing tests**: the booking document expectation, the sweep report and the view shapes gain the new fields.

## Complexity Tracking

*No entries.*
