# Research: Match Close, Minimal Rating and No-shows

**Feature**: `021-match-close-rating-no-show` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- how bookings complete (§1);
- where ratings live and how they're given (§2–§3);
- how no-shows reuse 018 (§4);
- the no-show sweep (§5);
- cases (§6);
- the endpoints (§7);
- the notices (§8).

The clarifications fix two things:
1. a client's "no" without a check-in records the no-show at once, plus a case;
2. ratings are private.

---

## §1 Completing bookings

**Decision**: A sweep job, `BookingCompletionJob` (`booking-completion`).
- It reads `bookingRepository.findDueForCompletion(now, cap)`: `{ status: 'assigned', endsAt: { $lte: now } }`, sorted by `endsAt`, served by a new index `status_endsAt`.
- It groups the bookings by request and calls `IBookingLifecycleStore.complete(requestId, now, buildEvents)`, one transaction per request, mirroring 016's `expire`:
  1. a conditional `updateMany({ requestId, status: 'assigned', endsAt ≤ now }, { status: 'completed', completedAt: now })`;
  2. bookings with a check-in also get `attendance: 'attended'` right away, since the check-in is the proof (FR, US3 scenario 2);
  3. `booking.completed` events, one per booking, for future use (invoicing, 023);
  4. `deactivateIfEnded` (016): a completed booking isn't live.

A second run finds nothing assigned: exactly once (FR-001). The request's derived status is already `completed` (010's `requestStatusOf`), with no change needed.

## §2 Ratings: one collection, one per side and booking

**Decision**: A new collection, **`ratings`**:
- `_id`, `bookingId`, `requestId`;
- `side: 'client' | 'goalkeeper'` (who rates);
- `authorId`, `subjectId` (who is rated);
- `answer: boolean` ("did they come" / "were you paid");
- `stars: 1–5`, `comment: string | null` (≤ 500);
- `createdAt`.

Indexes: `booking_side_unique` `{ bookingId: 1, side: 1 }` (unique) and `author_created` `{ authorId: 1, createdAt: -1 }`.

**The side is inferred** from the caller: the booking's client rates as `client`, and the goalkeeper holding it rates as `goalkeeper`. A user who is neither gets `booking_not_found`.

**When a rating is allowed** (FR-003, FR-004, FR-006):
- **client**: the booking has a goalkeeper, and is `completed`, or `assigned` with a check-in, and `now ≤ endsAt + 7 days`;
- **goalkeeper**: the booking is `completed` and `now ≤ endsAt + 7 days`.

A `goalkeeper_withdrew`, `cancelled` or `expired` booking is never rateable.

**Privacy** (clarification 2): no endpoint exposes someone else's rating. Only the author sees their own (pending list and answer), and administrators see it through the case that references it.

## §3 Rating is one transaction with its consequences

**Decision**: `IBookingLifecycleStore.rate(args)` in `MongoBookingLifecycleStore`, one `withTransaction`:

1. **Read the booking** and check it's rateable (§2). Refusals → `not_found` / `not_rateable { reason }`.
2. **Insert the rating.** A duplicate key → `already_rated` (abort, no write).
3. **Consequences**:

   | Side | Answer | Check-in | Effect |
   |---|---|---|---|
   | client | yes | none | Set `attendance: 'attended'`, unless a no-show was already recorded: then open case `late_attendance_claim` |
   | client | yes | present | Nothing (already attended) |
   | client | no | none | Record the no-show now (§4), and open case `goalkeeper_no_show` (clarification 1) |
   | client | no | present | Open case `goalkeeper_no_show` only; no penalty |
   | goalkeeper | yes | — | Nothing |
   | goalkeeper | no | — | Open case `payment_not_received` |

4. **Append** the events (`goalkeeper.no_show` when one was recorded).

The handler relays after the commit.

**Races**: the no-show sweep and a client's rating both write the booking document (`attendance`), so the driver retries the loser. It then sees the other's outcome:
- if the sweep won, a late "yes" becomes a `late_attendance_claim` case;
- if the rating won, the sweep sees `attendance` set and skips.

## §4 No-show = 018's incident of kind `no_show`

**Decision**: Reuse 018's machinery, extracted from `withdraw` into a private store helper, `recordIncidentInSession(session, { kind, booking, goalkeeperId, now, late, noticeMinutes, config, newId })`. It does four things:
- inserts the incident;
- counts the window;
- applies `penaltiesFor`;
- writes the suspension.

`withdraw` keeps using it with `kind: 'withdrawal'`. A no-show calls it with:
- `kind: 'no_show'`;
- `late: true` (the policy treats it as a withdrawal with less than 2 hours' notice, FR-009);
- `noticeMinutes: 0`;
- `replacementBookingId: null`.

The `kind_booking_unique` index (018) makes it at most once per booking. The booking gets `attendance: 'no_show'` and `noShowAt: now`.

- **Penalty values**: 018's `resolvePenaltyConfig` for the goalkeeper's country.
- **History**: 018's lists already read every kind. The item gains `kind` (`withdrawal` | `no_show`).
- **Reversal**: 018's admin reversal works on the incident id, whatever its kind. It forgives the incident, lifts the penalties and optionally refunds the commission (FR-009).
- **Domain**: `IncidentKind` gains `'no_show'`.

## §5 The no-show sweep

**Decision**: A sweep job, `NoShowWatchJob` (`no-show-watch`), after `booking-completion`.
- **Query**: `bookingRepository.findDueForAttendance(now, cap)`: `{ status: 'completed', attendance: null, endsAt: { $lte: now − 15 min } }`. 15 min is the configurable minimum; the index is `status_endsAt`.
- **Per booking**: it resolves the grace period (§ config) and skips while `now < endsAt + grace`. It resolves the penalty config, then calls `store.settleAttendance({ bookingId, now, config, newId, buildEvents })`, which in one transaction:
  - re-reads the booking (still `completed`, `attendance: null`, no check-in);
  - reads the client's rating: a "yes" → `attended`. A "no" can't be pending, because it would already have recorded the no-show (§3);
  - otherwise it records the no-show (§4), with the event.
- **Relay**: the job relays the events.

**Config**: the country-scope `bookingSettings.noShowGraceMinutes` (integer 15–240, default 60), resolved like 020's window. The resolver becomes one generic `createCountrySettingsResolver(deps)`, returning the country `BookingSettings | null` per city (cached). 020's `createCheckInWindowResolver` is rewritten on top of it, with the same defaults and warnings, and so is the grace.

## §6 Cases

**Decision**: A new collection, **`cases`**:
- `_id`;
- `type: 'goalkeeper_no_show' | 'payment_not_received' | 'late_attendance_claim'`;
- `bookingId`, `requestId`, `clientId`, `goalkeeperId`;
- `ratingId`;
- `checkIn` (snapshot of the booking's check-in, or null);
- `noShowIncidentId` (when one exists);
- `status: 'open' | 'resolved'`, `createdAt`;
- `resolution: { by, at, note } | null`.

Indexes:
- `booking_type_unique` `{ bookingId: 1, type: 1 }` (unique): one case per answer (FR-011);
- `status_created` `{ status: 1, createdAt: -1 }`.

Cases are created inside the rating transaction (§3). Resolution is a conditional `updateOne({ _id, status: 'open' })`: a repeat → `already_resolved`. Resolving doesn't reverse anything by itself; the admin uses 018's reversal on `noShowIncidentId` if fair.

## §7 Endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/ratings/pending` | client or goalkeeper | Pending ratings, newest match first |
| `POST /api/ratings/bookings/{bookingId}` | client or goalkeeper | Rate: `{ answer: boolean, stars: 1–5, comment?: string ≤ 500 }` |
| `GET /api/admin/cases?status&page&pageSize` | admin | List cases (open first) |
| `GET /api/admin/cases/{caseId}` | admin | One case, with the rating and the check-in |
| `POST /api/admin/cases/{caseId}/resolve` | admin | `{ note: 3–500 }` |

**The pending list** (FR-005), built from two reads:
- **client**: bookings with `clientId = me`, `status ∈ {completed, assigned with checkIn}`, and `endsAt ≥ now − 7 d`;
- **goalkeeper**: bookings with `goalkeeperId = me`, `status: completed`, and `endsAt ≥ now − 7 d`.

In both, it drops those already rated by that side. Each item: `bookingId`, `requestId`, `side`, the match place and time, the other party's name, and `dueUntil`.

The new index `client_endsAt` `{ clientId: 1, endsAt: -1 }` serves the client read; the goalkeeper read uses `goalkeeper_start`.

**Answers**: `201` with the rating on success. Errors:
- `404 booking_not_found`;
- `409 not_rateable { reason: 'not_finished' | 'expired' | 'no_goalkeeper' }`;
- `409 already_rated`;
- `400 validation_failed`.

Every attempt is audited (`logRating`).

## §8 Notices

- **No-show** → a notice to the goalkeeper (push and inbox, `notifyOnce`, key `no-show:{bookingId}`), sent by a consumer of `goalkeeper.no_show` (`NoShowNoticeHandler`). Text: "No confirmaste tu llegada al partido en Bello · 3:00 p. m. y quedó registrado como inasistencia. Quedaste suspendido hasta el lun 5 oct, 6:30 p. m." Type: `goalkeeper.no_show`.
- **Pending ratings**: no push (roadmap).
- **Cases**: no notice (operations works outside the platform).

## §9 Domain changes

`Booking` gains:
- `completedAt: Date | null`;
- `attendance: 'attended' | 'no_show' | null`;
- `noShowAt: Date | null`.

New domain types: `Rating` (validated stars and comment), `Case` (with `resolve(decision)`), and `ratingWindow(booking)` (`dueUntil = endsAt + 7 d`; who can rate, when).
