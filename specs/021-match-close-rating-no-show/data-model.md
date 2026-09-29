# Data Model: Match Close, Minimal Rating and No-shows

**Feature**: `021-match-close-rating-no-show` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

There are two new collections, `ratings` and `cases`, plus new fields on `bookings`, `goalkeeperIncidents` and `bookingSettings`.

## `bookings` (changed)

| Field | Type | Notes |
|---|---|---|
| `status` | `completed` becomes reachable | Set at `endsAt` |
| `completedAt` | `Date \| null` | |
| `attendance` | `'attended' \| 'no_show' \| null` | Set on completion when checked in; otherwise by the client's answer or the no-show sweep |
| `noShowAt` | `Date \| null` | |

New indexes:
- `status_endsAt`: `{ status: 1, endsAt: 1 }`;
- `client_endsAt`: `{ clientId: 1, endsAt: -1 }`.

```text
assigned ── endsAt ─────────────────────────────▶ completed (+ attendance: attended if checked in)
completed, no check-in ── client "yes" ─────────▶ attendance: attended
completed/assigned, no check-in ── client "no" ─▶ attendance: no_show (+ incident + case)
completed, no check-in ── endsAt + grace, no "yes" ─▶ attendance: no_show (+ incident)
```

## `ratings` (new)

| Field | Type | Notes |
|---|---|---|
| `_id` | uuid v7 | |
| `bookingId`, `requestId` | string | |
| `side` | `'client' \| 'goalkeeper'` | Who rates |
| `authorId`, `subjectId` | string | |
| `answer` | boolean | Client: "did they come". Goalkeeper: "were you paid" |
| `stars` | integer 1–5 | |
| `comment` | string \| null | Trimmed, ≤ 500 |
| `createdAt` | Date | |

Indexes:
- `booking_side_unique`: `{ bookingId: 1, side: 1 }`, unique;
- `author_created`: `{ authorId: 1, createdAt: -1 }`.

## `cases` (new)

| Field | Type | Notes |
|---|---|---|
| `_id` | uuid v7 | |
| `type` | `'goalkeeper_no_show' \| 'payment_not_received' \| 'late_attendance_claim'` | |
| `bookingId`, `requestId`, `clientId`, `goalkeeperId` | string | |
| `ratingId` | string | The answer that opened it |
| `checkIn` | the booking's check-in snapshot \| null | |
| `noShowIncidentId` | string \| null | |
| `status` | `'open' \| 'resolved'` | |
| `resolution` | `{ by, at, note } \| null` | Note 3–500 |
| `createdAt` | Date | |

Indexes:
- `booking_type_unique`: `{ bookingId: 1, type: 1 }`, unique;
- `status_created`: `{ status: 1, createdAt: -1 }`.

## `goalkeeperIncidents` (changed)

`kind` gains `'no_show'`. For a no-show:
- `late: true`, `noticeMinutes: 0`;
- `replacementBookingId: null`;
- `reason: null`.

The penalties come from 018's policy.

## `bookingSettings` (changed, country scope)

`noShowGraceMinutes`: integer 15–240, default 60.

## `outbox`: new events

| Event | Payload |
|---|---|
| `booking.completed` | `clientId`, `goalkeeperId`, `zoneId`, `startsAt`, `completedAt`, `checkedIn: boolean` |
| `goalkeeper.no_show` | `goalkeeperId`, `clientId`, `zoneId`, `startsAt`, `incidentId`, `suspendedUntil \| null`, `penalties: [{ kind, days, endsAt }]` |

## `notifications`

New type `goalkeeper.no_show` (goalkeeper), with dedupe key `no-show:{bookingId}`.

## Ports

| Port | Change |
|---|---|
| `IBookingLifecycleStore` | `complete(requestId, now, buildEvents)`, `rate(args): RateResult` and `settleAttendance(args): SettleResult` |
| `IBookingRepository` | `findDueForCompletion(now, cap)`, `findDueForAttendance(now, cap)` and `findRateable(userId, now)` (client and goalkeeper sides) |
| `IRatingRepository` (new) | `findByBookingsAndSide(bookingIds, side)` (for the pending list) |
| `ICaseRepository` (new) | `list(status \| null, skip, limit)`, `count(status)`, `getById(id)`, `resolve(id, decision): Promise<'resolved' \| 'already_resolved' \| 'not_found'>` |
| `IBookingAuditLogger` | `logRating`, `logCaseResolution` |
