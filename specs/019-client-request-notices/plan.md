# Implementation Plan: Client Request Notices

**Branch**: `019-client-request-notices` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-client-request-notices/spec.md`

## Summary

**Contact visibility** (Story 3):
- A pure domain rule, `contactsVisibleFrom(request)` = the free-cancellation deadline (start − 60 min), hides the other party's name and WhatsApp until that moment, both ways.
- It's enforced inside the two response builders every view goes through: `toRequestResponse` for the client and `toAgendaItem` for the goalkeeper. Each also returns the moment the contacts become visible.

**Assignment notices** (Stories 1–2): a new consumer of `goalkeeper.assigned` (013). For each event it:
- skips stale events;
- sends `request.complete` when the acceptance leaves nothing searching, else `booking.goalkeeper_assigned`;
- de-duplicates with inbox keys (one "complete" per completion round, 018's replacement rule);
- includes the goalkeeper's contact only for bookings taken in the last hour.

**Contacts-visible notices** (Story 4): a new sweep job, `contacts-reveal`. At start − 60 min it tells the client and each goalkeeper assigned before then who the other is, exactly once, gated by `goalkeeperRequests.contactsRevealedAt`.

A small `notifyOnce` helper (inbox, then push) is shared with 018's withdrawal notices and left ready for 020's "no check-in" notice.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Reused:
- 013: consumers and the sweep;
- 014: push;
- 015/016: the inbox and its dedupe keys;
- 012: contacts.

No new dependency.
**Storage**: MongoDB. There's no new collection. `goalkeeperRequests` gains `contactsRevealedAt` and the index `contactsReveal_due`. See [data-model.md](./data-model.md).
**Testing**: As 016–018:
- **unit**:
  - the visibility rule and `isRequestComplete`;
  - the messages;
  - the consumer (assigned vs. complete, replacement text, stale skip, redelivery, completion rounds, contacts only for last-hour assignments);
  - the sweep job (who gets what, exactly once, nothing after the start, no notice for last-hour bookings);
  - the repository queries on mocked collections;
- **HTTP**: the visibility of contacts in every client and goalkeeper answer before and after start − 60, and the notices end to end in `local` events mode.

**Target Platform**: Firebase App Hosting.
**Project Type**: Single backend web service.
**Performance Goals**:
- assignment notices within the 2 s relay (SC-001);
- contacts-visible notices within one sweep (SC-007).

**Constraints**:
- no early reveal of the other party's contact, in views or notices (SC-006);
- one notice per reason;
- the inbox entry is kept even when the push fails.

**Scale/Scope**: One notice per acceptance, plus up to 3 per request at start − 60.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–018 discipline applies:
- **Layering**: the rules in the domain, the consumer and the job in the application behind the existing ports, the queries in infrastructure.
- **CQRS and exhaustive mappings.**
- **Fakes, no real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits are deliberate and covered by updated tests of 010, 012, 017 and 018:
- the response builders;
- the agenda and acceptance answers;
- the sweep job list.

## Project Structure

### Documentation (this feature)

```text
specs/019-client-request-notices/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/client-notices.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/contactVisibility.ts             # NEW: contactsVisibleFrom/At, isRequestComplete, completionRound
│   ├── bookings/goalkeeperRequest.ts             # MODIFIED: contactsRevealedAt
│   └── notifications/assignmentMessages.ts       # NEW: the 4 messages
├── application/features/
│   ├── bookingLifecycle/
│   │   ├── common/notifyOnce.ts                  # NEW: inbox-then-push helper
│   │   ├── handlers/clientAssignmentNoticeHandler.ts  # NEW: consumer of goalkeeper.assigned
│   │   ├── handlers/withdrawalNoticeHandler.ts   # MODIFIED: uses notifyOnce
│   │   ├── handlers/clientOutcomeNoticeHandler.ts     # MODIFIED: uses completionRound (shared)
│   │   └── jobs/contactsRevealJob.ts             # NEW: sweep job
│   └── goalkeeperRequests/
│       ├── common/requestResponse.ts             # MODIFIED: hide contact before the moment; contactsVisibleFrom
│       ├── common/goalkeeperBookingResponse.ts   # MODIFIED: toAgendaItem(now); clientContactVisibleFrom
│       ├── common/ports.ts                       # MODIFIED: findDueForContactsReveal, markContactsRevealed
│       └── (agenda, accept handlers)             # MODIFIED: pass now
├── infrastructure/
│   ├── persistence/mongo/goalkeeperRequestRepository.ts  # MODIFIED: field, index, 2 methods
│   ├── openapi/openapiSpec.ts                    # MODIFIED: new fields
│   └── di.ts                                     # MODIFIED: consumer + job
tests/ (fakes extended; unit + http as in Technical Context)
docs/push-notifications.md                        # MODIFIED: the 4 types
```

**Structure Decision**: The notices live in the `bookingLifecycle` slice, next to 016's and 018's. The visibility rule is domain code under `bookings/`, applied in the `goalkeeperRequests` response builders that all views share.

## Implementation notes

- **Consumer flow**:
  1. `runOnce`;
  2. load the request and its bookings, and the booking;
  3. skip if stale or ended;
  4. `isRequestComplete` → the message kind;
  5. load contacts only when some booking involved was assigned at or after `contactsVisibleFrom`;
  6. `notifyOnce`.
- **Sweep order**: `cancel-all`, `booking-expiry`, `offer-reminders`, `contacts-reveal`. "Cancel all" runs at the same instant (start − 60), and must first cancel an incomplete request, so its goalkeepers aren't revealed.
- **Contacts for the job**: one `loadContacts` call for the client and the goalkeepers of each request.
- **Existing tests**: every expectation of a contact right after acceptance changes to `null`, plus the visible-from field. The 012 tests that check the contact move the clock into the last hour.

## Complexity Tracking

*No entries.*
