# Implementation Plan: Notify Eligible Goalkeepers of Available Matches

**Branch**: `015-notify-eligible-goalkeepers` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-notify-eligible-goalkeepers/spec.md`

## Summary

**Eligibility.** A pure domain predicate, `isEligible(snapshot, booking, now)`, says whether a goalkeeper can take a booking. The snapshot holds the goalkeeper's zones, switch, suspension, balance, `canSeeOffers` and held bookings. It reuses 012's funds and schedule functions. Two application services apply it:
- **goalkeeper → bookings**: extracted from 012's available list, now gated by the switch;
- **bookings → goalkeepers**: batched loads for many goalkeepers.

**First notification.** A `booking.created` consumer (013 `runOnce`) sends `NotifyBookingOffersCommand`. It:
1. creates one **offer** per eligible goalkeeper and request in a new `notifications` inbox, idempotent through a unique partial index;
2. pushes through 014's `IPushNotifier`, only to the goalkeepers whose offer it just inserted.

**Reminders.** A scheduled job on 013's sweep (`offer-reminders`):
- recomputes open offers every minute and creates missing ones for newly eligible goalkeepers;
- claims each goalkeeper atomically in `offerPushState`, so pushes are ≥ 5 min apart;
- sends **one** push per goalkeeper, for one match or grouped;
- counts a reminder on each offer, up to 3.

**The switch.** `goalkeeperProfiles.availableForOffers` (absent means on):
- off: no offers, and 012's list and accept refuse (clarification 3);
- on: an immediate catch-up with one push (clarification 4).

**Endpoints.** The inbox (`/api/notifications`: list, read, read-all, dismiss) and `PUT /api/goalkeepers/me/offers-availability`.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. The 014 push capability and the 013 events and sweep are reused. Dates are formatted with the built-in `Intl`. No new dependency.
**Storage**: MongoDB.
- New collections: `notifications` (inbox; unique partial index on offers; 90-day TTL) and `offerPushState`.
- New field `goalkeeperProfiles.availableForOffers`, plus index `zone_offers`.
- New index on `bookings`: `status_searchEnds`.

See [data-model.md](./data-model.md).
**Testing**: Vitest tiers as in 008–014:
- unit: the eligibility predicate (with a both-directions consistency test), messages, the command, job and catch-up handlers with fakes, repositories on mocked collections;
- HTTP: the inbox, the switch, and 012's changed endpoints; confirmation → offers end to end with `eventsMode: 'local'`;
- no real FCM or Pub/Sub.

**Target Platform**: Firebase App Hosting (Cloud Run, `maxInstances: 1`). Rounds run on 013's every-minute sweep (a local timer or Cloud Scheduler).
**Project Type**: Single backend web service.
**Performance Goals**:
- SC-004: first push ≤ 10 s after confirmation;
- SC-008: a round with 500 open bookings × 1,000 goalkeepers ≤ 30 s. That is about 6 batched reads, an in-memory join and pushes 10 at a time.

**Constraints**:
- one offer per goalkeeper and request;
- ≤ 1 push per goalkeeper per round, ≥ 5 min apart;
- ≤ 3 reminders per offer;
- 0 offers to non-eligible goalkeepers;
- the confirmation is never failed by notifications.

**Scale/Scope**: Tens to hundreds of goalkeepers per zone, and hundreds of open bookings.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the template. The plan follows the 001–014 discipline:
- **Layering**:
  - domain: the pure predicate and message builders;
  - application: the commands, the job and the eligibility services, behind ports;
  - infrastructure: Mongo only.
- **CQRS**:
  - commands: `NotifyBookingOffers`, `SetOffersAvailability`, `MarkNotificationRead`, `MarkAllNotificationsRead`, `DismissOffer`;
  - query: `ListNotifications`;
  - the consumer is a notification handler, and the rounds are an `IScheduledJob`.
- **Exhaustive outcome mapping** in the controllers.
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes. One deliberate cross-feature change: 012's list and accept gain the switch gate (FR-028, clarification 3), covered by extended 012 tests.

## Project Structure

### Documentation (this feature)

```text
specs/015-notify-eligible-goalkeepers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/notifications-and-offers.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/offerEligibility.ts            # NEW: OfferSnapshot, isEligible()
│   ├── notifications/offerMessages.ts          # NEW: singleOfferMessage(), groupedOfferMessage()
│   └── goalkeepers/goalkeeperProfile.ts        # MODIFIED: availableForOffers (default true)
│
├── application/features/
│   ├── notifications/
│   │   ├── common/ports.ts                     # NEW: INotificationRepository, IOfferPushState, Notification types
│   │   ├── common/offerEligibilityService.ts   # NEW: availableBookingsFor(), eligibleGoalkeepersFor()
│   │   ├── common/offerSender.ts               # NEW: create-if-absent + one push per goalkeeper + bookkeeping (shared)
│   │   ├── commands/notifyBookingOffers/       # NEW: first notification (from booking.created)
│   │   ├── commands/setOffersAvailability/     # NEW: the switch + catch-up
│   │   ├── commands/markNotificationRead/      # NEW
│   │   ├── commands/markAllNotificationsRead/  # NEW
│   │   ├── commands/dismissOffer/              # NEW
│   │   ├── queries/listNotifications/          # NEW: page + unreadCount + stillAvailable
│   │   ├── handlers/notifyBookingOffersHandler.ts  # NEW: INotificationHandler (booking.created, runOnce)
│   │   └── jobs/offerRemindersJob.ts           # NEW: IScheduledJob 'offer-reminders'
│   ├── goalkeeperRequests/
│   │   ├── queries/listAvailableBookings/…     # MODIFIED: use availableBookingsFor(); reason not_available_for_offers
│   │   └── commands/acceptBooking/…            # MODIFIED: outcome not_available_for_offers
│   ├── goalkeepers/common/ports.ts             # MODIFIED: findOfferCandidates, setAvailableForOffers
│   ├── goalkeepers/common/goalkeeperRegistrationResponse.ts  # MODIFIED: availableForOffers
│   ├── wallet/common/ports.ts                  # MODIFIED: findByGoalkeeperIds
│   └── goalkeeperRequests/common/ports.ts      # MODIFIED: findOpenPending, findAssignedToGoalkeepers
│
├── infrastructure/
│   ├── persistence/mongo/notificationRepository.ts   # NEW (+ indexes, TTL)
│   ├── persistence/mongo/offerPushStateStore.ts      # NEW
│   ├── persistence/mongo/goalkeeperProfileRepository.ts  # MODIFIED (+ zone_offers index)
│   ├── persistence/mongo/walletRepository.ts         # MODIFIED
│   ├── persistence/mongo/bookingRepository.ts        # MODIFIED (+ status_searchEnds index)
│   ├── openapi/openapiSpec.ts                        # MODIFIED: Notifications tag, switch, 012 changes
│   ├── config.ts                                     # MODIFIED: config.offers
│   └── di.ts                                         # MODIFIED: repos, services, handlers, subscriber, job
├── controllers/
│   ├── notificationsController.ts              # NEW: /api/notifications
│   ├── goalkeeperController.ts                 # MODIFIED: PUT /me/offers-availability; 012 mappings
│   └── requests/notifications/, requests/goalkeepers/offersAvailabilityRequest.ts  # NEW
└── app.ts                                      # MODIFIED: mount /api/notifications

tests/ (fakes: notification repo, offer push state; unit + http as in Technical Context)
README.md, .env.example                         # MODIFIED: OFFER_* variables
```

**Structure Decision**:
- A new `notifications` application slice owns the inbox, offers, reminders and the switch catch-up. 019 will add client types to the same slice.
- The eligibility services live there too, and 012's list delegates to them, so there is one implementation of "can take".

## Implementation notes

- **`offerSender.sendOffers(goalkeeperId → requests[], now, mode)`**, the one path shared by the first notification, the catch-up and the rounds:
  1. `createOfferIfAbsent` for each (goalkeeper, request);
  2. pick the open offers;
  3. claim per `mode`:
     - `first` and `catchUp`: pushed unconditionally, then `markPushed`;
     - `round`: `tryClaim` per goalkeeper;
  4. one `sendToUsers` per distinct message;
  5. `markNotified` / `markReminded`;
  6. return the counts.

  For the first notification, only the offers **inserted by this call** are pushed (FR-005).
- **The booking used in `data.bookingId`**: the earliest-created pending booking of the request the goalkeeper is eligible for.
- **Consistency test**: generate goalkeepers and bookings covering each rule, then assert `availableBookingsFor(g)` ⇔ `eligibleGoalkeepersFor(bs)` for every pair (FR-002).
- **Accept order**: the `not_available_for_offers` check comes after `replayed` and before `suspended`.
- **The list order**: `not_available_for_offers` comes before `suspended` and `insufficient_funds`.
- **Job registration**: `jobs: [offerRemindersJob]` in `di.ts`. The test factory registers it too, so HTTP tests can run a round with `RunSweepCommand`.
- **Subscriber registration**: `booking.created` → `NotifyBookingOffersHandler`, in `di.ts` and `testAppFactory.ts`, next to the delivery log.

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected because |
|---|---|---|
| The reminder interval and cap are global config, not per country (spec Assumptions) | Colombia is the only country; per-country lookup in every round adds cost with no present benefit (research §9) | Per-country now means country resolution per goalkeeper per round. It moves to `bookingSettings` when a second country launches. |
