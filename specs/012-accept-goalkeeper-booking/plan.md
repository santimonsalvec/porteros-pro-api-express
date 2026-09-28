# Implementation Plan: Goalkeepers See Available Matches and Accept One

**Branch**: `012-accept-goalkeeper-booking` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-accept-goalkeeper-booking/spec.md`

## Summary

**Quoting** now also fixes the booking's **commission** (011's resolver; the quote is refused when it is missing) and the **travel margin** (a new booking setting: default 30 minutes plus a warning). Both travel through the request to each booking. Each booking also stores:
- `endsAt`;
- `searchEndsAt = startsAt − margin`.

Three new goalkeeper endpoints:
- **`GET /me/available-bookings`**: indexed candidates (pending, enabled zones, search open, not their own request, affordable commission), then filtered by a pure `schedulePolicy` (clash with margin, same request) and paginated. When the goalkeeper can't see offers (suspended, or 011's rule (a)), the list is empty with a reason.
- **`POST /me/bookings/:id/accept`**: one MongoDB transaction:
  1. a conditional claim of the pending booking;
  2. a check against the goalkeeper's assigned bookings;
  3. the commission charged via 011's `appendMovementInSession`.

  The wallet write serializes all acceptances of the same goalkeeper, so concurrent clashes are impossible. The conditional claim gives one winner per booking. Replays are detected before the transaction.
- **`GET /me/bookings`**: the agenda.

After assignment, contacts (name and WhatsApp) are exposed both ways: in the agenda and in the client's request views.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. No new dependency.
**Storage**: MongoDB (Atlas, transactions). No new collection. New fields on `quotes`, `goalkeeperRequests`, `bookings`, `bookingSettings` and `goalkeeperProfiles`, and 2 new indexes on `bookings`. See [data-model.md](./data-model.md).
**Testing**: Vitest tiers as in 008–011, plus a manual real-concurrency check ([quickstart.md](./quickstart.md) §4).
**Target Platform**: Firebase App Hosting (Cloud Run).
**Project Type**: Single backend web service.
**Performance Goals**: SC-005 — the available list in under 1 s at p95 with up to 500 pending bookings in the goalkeeper's zones. The read cost is:
- the profile;
- the wallet;
- the goalkeeper's assigned upcoming bookings;
- 1 indexed candidate query, capped at 1.000;
- per page, 1 `$in` read of the requests and 2 name lookups.

**Constraints**:
- assignment and charge are all or nothing;
- one winner per booking;
- no clash, even under concurrency;
- no client data before assignment.

**Scale/Scope**: Tens to hundreds of pending bookings per zone set; a handful of commitments per goalkeeper.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the template; the plan follows the 001–011 discipline:
- **Layering**: new persistence behind ports. `IBookingAcceptanceStore` hides the transaction. The wallet charge reuses 011's exported session function inside infrastructure only.
- **Rules in the domain**: `schedulePolicy` and `Booking.isSearchOpenAt`.
- **CQRS**: the two lists are queries; the acceptance is a command.
- **Exhaustive outcome mapping.**
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes.
- Cross-slice use: `goalkeeperRequests` uses the wallet slice's `CommissionResolver` (quote) and `fundsPolicy` / `MovementDraft` (accept). This is allowed application-to-application use, with no infrastructure types involved.

## Project Structure

### Documentation (this feature)

```text
specs/012-accept-goalkeeper-booking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/goalkeeper-bookings.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── bookings/
│   │   ├── schedulePolicy.ts                    # NEW: clashes, firstConflict, holdsSameRequest
│   │   ├── quote.ts                             # MODIFIED: + commission, travelBufferMinutes
│   │   ├── goalkeeperRequest.ts                 # MODIFIED: + commission, travelBufferMinutes (copied)
│   │   └── booking.ts                           # MODIFIED: + commission, travelBufferMinutes, endsAt, searchEndsAt,
│   │                                            #   goalkeeperId, assignedAt; isSearchOpenAt; assign()
│   ├── pricing/bookingSettings.ts               # MODIFIED: + travelBufferMinutes
│   └── goalkeepers/goalkeeperProfile.ts         # MODIFIED: + suspendedUntil
│
├── application/features/
│   ├── auth/common/ports.ts                     # MODIFIED: IUserRepository.getByIds
│   └── goalkeeperRequests/
│       ├── common/
│       │   ├── bookingLimits.ts                 # MODIFIED: + TRAVEL_BUFFER_MINUTES_DEFAULT = 30, AVAILABLE_CANDIDATES_CAP = 1000
│       │   ├── resolveBookingSettings.ts, serviceArea.ts   # MODIFIED: travelBufferMinutes (nullable, not missing)
│       │   ├── ports.ts                         # MODIFIED: booking reads, IBookingAcceptanceStore, IAcceptanceAuditLogger, findByIds
│       │   ├── contacts.ts                      # NEW: toContact(user), loadContacts(userRepo, ids)
│       │   ├── requestResponse.ts               # MODIFIED: bookings[].goalkeeper / assignedAt
│       │   └── goalkeeperBookingResponse.ts     # NEW: available item, agenda item builders
│       ├── queries/getServiceQuote/             # MODIFIED: resolve commission (missing → service_not_configured) + travel margin
│       ├── commands/issueServiceQuote/          # MODIFIED: store commission + travel margin; defaulted-margin flag
│       ├── commands/confirmBooking/             # MODIFIED: copy fields; contacts on replay
│       ├── queries/listClientRequests/          # MODIFIED: goalkeeper contacts
│       ├── queries/listAvailableBookings/       # NEW
│       ├── queries/listGoalkeeperAgenda/        # NEW
│       └── commands/acceptBooking/              # NEW: pre-checks → store.accept → classify not_claimed
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── bookingRepository.ts                 # MODIFIED: new fields, 2 indexes, new reads
│   │   ├── goalkeeperRequestRepository.ts       # MODIFIED: fields, findByIds
│   │   ├── quoteRepository.ts                   # MODIFIED: fields
│   │   ├── bookingAcceptanceStore.ts            # NEW: claim → commitments → appendMovementInSession, typed aborts
│   │   ├── bookingSettingsRepository.ts         # MODIFIED: travelBufferMinutes
│   │   ├── goalkeeperProfileRepository.ts       # MODIFIED: suspendedUntil
│   │   └── userRepository.ts                    # MODIFIED: getByIds
│   ├── observability/pinoAuditLogger.ts         # MODIFIED: logAcceptance
│   ├── di.ts                                    # MODIFIED
│   └── openapi/openapiSpec.ts                   # MODIFIED
└── controllers/goalkeeperController.ts          # MODIFIED: 3 routes
                goalkeeperRequestsController.ts  # MODIFIED: log defaulted travel margin; commission in missing

tests/ … (unit: schedulePolicy, booking, quote handlers, acceptance handler + store, list handlers; http: available/accept/agenda + contacts)
```

**Structure Decision**:
- The acceptance lives in the `goalkeeperRequests` slice, because it acts on its bookings. It is exposed on the goalkeeper router (`/api/goalkeepers/me/...`), because the goalkeeper is the actor.
- The wallet is only used through its exported application types and the infrastructure session function.

## Implementation notes

- **Typed aborts** in the acceptance transaction: throw `AcceptanceAbort(kind, extra)` inside the callback. `withTransaction` aborts on it and does not retry (it is not a `TransientTransactionError`), and the store converts it into the result.
- **Order inside the transaction**: claim → commitments → charge. The charge's wallet write is the serialization point (research §3). It must happen in **every** successful path, which it does, because acceptance always charges.
- **Pre-checks outside the transaction** (fast, give precise reasons): active goalkeeper, suspension, zone enabled, booking exists and is pending, search open, own request. Those that can race (pending, funds, conflicts) are checked again by the transaction.
- **Classifying `not_claimed`**: re-read the booking:
  - assigned to me → replayed;
  - assigned to someone else → already taken;
  - not pending → not available;
  - `searchEndsAt ≤ now` → search ended;
  - `clientId === me` → own request.
- **Contacts**: `whatsApp` is formatted as `"<countryCallingCode> <whatsAppNumber>"`.

## Complexity Tracking

*No entries.*
