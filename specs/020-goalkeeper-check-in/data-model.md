# Data Model: Goalkeeper Check-in with Photo

**Feature**: `020-goalkeeper-check-in` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

No new collection.

## `bookings` (changed)

| Field | Type | Notes |
|---|---|---|
| `checkIn` | `{ at: Date; imageId: string; photoUrl: string; location: { latitude; longitude; accuracyMeters \| null } \| null; distanceMeters: number \| null } \| null` | Set once by the check-in |
| `checkInOpenNoticeAt` | `Date \| null` | The "window open" reminder was sent |
| `checkInLastCallAt` | `Date \| null` | The "10 minutes left" reminder was sent |
| `checkInMissedAt` | `Date \| null` | No check-in by the window close; the client was told. This is the fact 021 reads |

All four are absent on older documents, which reads as `null`.

New index `status_startsAt`: `{ status: 1, startsAt: 1 }`.

```text
assigned ── check-in inside [start − 30, start + 15] ──▶ assigned + checkIn (once)
assigned ── start + 15 passes without check-in ────────▶ assigned + checkInMissedAt (client told)
```

The status is unchanged: completing the booking is 021's.

## `bookingSettings` (changed, country scope)

| Field | Type | Default (Colombia) |
|---|---|---|
| `checkInWindow.opensMinutesBefore` | integer 1–120 | 30 |
| `checkInWindow.closesMinutesAfter` | integer 1–60 | 15 |

## `outbox`: new event

`goalkeeper.checked_in` (v1). Payload: `goalkeeperId`, `clientId`, `zoneId`, `startsAt`, `checkedInAt`, `distanceMeters | null`.

## `notifications` (new types)

| Type | For | Dedupe key |
|---|---|---|
| `booking.goalkeeper_arrived` | client | `goalkeeper-arrived:{bookingId}` |
| `booking.check_in_missed` | client | `check-in-missed:{bookingId}` |
| `booking.check_in_open` | goalkeeper | `check-in-open:{bookingId}` |
| `booking.check_in_last_call` | goalkeeper | `check-in-last-call:{bookingId}` |

## Domain

- `CheckInWindow.of(startsAt, { opensMinutesBefore, closesMinutesAfter })` → `{ opensAt, lastCallAt (closesAt − 10 min, never before opensAt), closesAt }`, with `isOpen(now)` (inclusive).
- `distanceMeters(a, b)`: haversine distance, rounded to whole meters.

## Ports

| Port | Change |
|---|---|
| `IBookingLifecycleStore` | `checkIn(args): Promise<CheckInResult>` |
| `IBookingRepository` | `findForCheckInWatch(now, cap)`; `markCheckInNotice(bookingId, field, now): Promise<boolean>` (conditional on the field being null) |
| `IBookingAuditLogger` | `logCheckIn` |

`CheckInResult`:

```ts
| { kind: 'checked_in'; booking: Booking; events: DomainEvent[] }
| { kind: 'replayed'; booking: Booking }
| { kind: 'not_found' }
| { kind: 'not_assigned'; status: BookingStatus }
| { kind: 'too_early'; opensAt: Date }
| { kind: 'too_late'; closedAt: Date }
```
