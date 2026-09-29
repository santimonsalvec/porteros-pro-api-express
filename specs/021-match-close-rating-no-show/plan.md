# Implementation Plan: Match Close, Minimal Rating and No-shows

**Branch**: `021-match-close-rating-no-show` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-match-close-rating-no-show/spec.md`

## Summary

**Closing matches**: a `booking-completion` sweep job completes every assigned booking at its end. It uses one lifecycle transaction per request, like 016's expiry, and does three things:
- marks checked-in bookings as `attendance: attended`;
- records `booking.completed`;
- deactivates the request.

**Ratings**: a new `ratings` collection holds one private rating per side and booking (clarification 2). Users see their pending ones through `GET /api/ratings/pending` and rate with `POST /api/ratings/bookings/{id}`. The side is inferred from the caller. Each rating is one lifecycle transaction with its consequences:
- **client "yes"** without a check-in → attended;
- **client "no"** without a check-in → an immediate no-show plus a case (clarification 1);
- **client "no"** with a check-in → a case only;
- **goalkeeper "no"** → a `payment_not_received` case;
- **late "yes"** after a no-show → a case.

**No-shows**: a `no-show-watch` sweep job settles attendance at end + grace (60 min per country). A no-show reuses 018's incident machinery:
- `kind: 'no_show'`, treated as late;
- the same policy, weekly count and reversal.

The goalkeeper is notified.

**Cases**: a new `cases` collection. Administrators list, view and resolve them with a note.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused:
- 018's incident, policy and reversal;
- 020's check-in and country resolver, generalized;
- 019's `notifyOnce`;
- 013's sweep, outbox and consumers.

No new dependency.
**Storage**: MongoDB (Atlas, transactions).
- New collections: `ratings` and `cases`.
- `bookings` gains `completedAt`, `attendance` and `noShowAt`, with the indexes `status_endsAt` and `client_endsAt`.
- `goalkeeperIncidents.kind` gains `no_show`.
- `bookingSettings` gains `noShowGraceMinutes`.

See [data-model.md](./data-model.md).
**Testing**: As 016–020.
- **Unit**:
  - the rating window;
  - `Rating` and `Case` validation;
  - the completion job;
  - every row of the rating table (research §3);
  - the attendance job (silence, "yes", check-in, grace per country, exactly once, a race with a late rating);
  - the store transactions on mocked collections;
  - the pending list;
  - the case commands;
  - the no-show notice;
  - 018's history `kind`.
- **HTTP**: every contract row and the end-to-end flows in `local` mode.

**Target Platform**: Firebase App Hosting.
**Project Type**: Single backend web service.
**Performance Goals**:
- completion and attendance within one sweep (SC-001, SC-003);
- a rating answers like any write.

**Constraints**:
- exactly-once completion and no-show;
- one rating per side and booking;
- one case per answer;
- ratings are private.

**Scale/Scope**: One rating per side and booking, and occasional cases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–020 discipline applies:
- **Layering**: rules in the domain; commands, queries and jobs in the application; transactions in infrastructure.
- **CQRS and exhaustive mappings.**
- **Fakes, no real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits are deliberate and covered by tests:
- 018's `withdraw` refactored around a shared incident helper;
- 018's history item `kind`;
- 020's resolver generalized;
- the sweep job list.

## Project Structure

### Documentation (this feature)

```text
specs/021-match-close-rating-no-show/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/ratings-and-cases.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/booking.ts                         # MODIFIED: completedAt, attendance, noShowAt
│   ├── ratings/rating.ts                           # NEW: Rating, ratingWindow
│   ├── cases/case.ts                               # NEW: Case (+ resolve)
│   ├── goalkeepers/goalkeeperIncident.ts           # MODIFIED: kind 'no_show'
│   ├── pricing/bookingSettings.ts                  # MODIFIED: noShowGraceMinutes
│   ├── events/bookingEvents.ts, domainEvent.ts     # MODIFIED: booking.completed, goalkeeper.no_show
│   └── notifications/noShowMessages.ts             # NEW
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/ports.ts                         # MODIFIED: complete, rate, settleAttendance
│   │   ├── common/countrySettingsResolver.ts       # NEW (020's window resolver on top of it)
│   │   ├── jobs/bookingCompletionJob.ts            # NEW
│   │   ├── jobs/noShowWatchJob.ts                  # NEW
│   │   ├── handlers/noShowNoticeHandler.ts         # NEW
│   │   └── common/withdrawalResponses.ts           # MODIFIED: kind
│   ├── ratings/                                    # NEW slice: RateBooking command, ListPendingRatings query, ports
│   └── cases/                                      # NEW slice: ListCases/GetCase queries, ResolveCase command, ports
├── infrastructure/
│   ├── persistence/mongo/bookingLifecycleStore.ts  # MODIFIED: complete, rate, settleAttendance; shared incident helper
│   ├── persistence/mongo/ratingRepository.ts       # NEW
│   ├── persistence/mongo/caseRepository.ts         # NEW
│   ├── persistence/mongo/bookingRepository.ts      # MODIFIED: fields, indexes, 3 queries
│   ├── openapi/openapiSpec.ts                      # MODIFIED
│   └── di.ts                                       # MODIFIED
└── controllers/
    ├── ratingsController.ts                        # NEW: /api/ratings
    ├── adminController.ts                          # MODIFIED: /cases
    └── requests/ratings/, requests/cases/          # NEW: zod bodies
```

**Structure Decision**:
- The lifecycle transitions (complete, rate with its consequences, settle attendance) go in the `bookingLifecycle` store, next to withdrawal, where 018's incident helpers already live.
- Ratings and cases get their own slices for their endpoints and read models.

## Complexity Tracking

*No entries.*
