# Data Model: Goalkeepers See Available Matches and Accept One

**Feature**: `012-accept-goalkeeper-booking` | **Date**: 2026-09-27 | **Research**: [research.md](./research.md)

## `Quote` (extended)

| New field | Type | Notes |
|---|---|---|
| `commission` | integer > 0 | Resolved for the zone when issued (zone → anchor city → country, 011). Missing → the quote is refused (`missing: ['commission']`) |
| `travelBufferMinutes` | integer ≥ 0 | From `bookingSettings` (city → country), default 30 plus a warning |

A stored quote without these fields (issued before the release) is not expected: the release deletes quotes (research §10).

## `GoalkeeperRequest` (extended)

It gains `commission` and `travelBufferMinutes`, copied from the quote.

## `Booking` (extended, collection `bookings`)

| Field | Type | Notes |
|---|---|---|
| `commission` | integer > 0 | Fixed at quote time (clarification 1) |
| `travelBufferMinutes` | integer ≥ 0 | Fixed at quote time |
| `endsAt` | Date | `startsAt + durationMinutes` |
| `searchEndsAt` | Date | `startsAt − travelBufferMinutes`; acceptance requires `now < searchEndsAt` |
| `goalkeeperId` | string \| null | Set on acceptance |
| `assignedAt` | Date \| null | Set on acceptance |

State in this feature: `pending_assignment → assigned`, and nothing else.

**New indexes** (`BookingRepository.ensureIndexes()`):

| Name | Definition | Serves |
|---|---|---|
| `status_zone_start` | `{ status: 1, zoneId: 1, startsAt: 1, _id: 1 }` | Available candidates (research §4) |
| `goalkeeper_start` | `{ goalkeeperId: 1, startsAt: 1, _id: 1 }` | Agenda and commitments (research §3, §7) |

## `BookingSettings` (extended)

A new optional field, `travelBufferMinutes` (integer ≥ 0), per country or city. It is not in `missing`: the default is 30 plus a warning.

## `GoalkeeperProfile` (extended)

A new optional field, `suspendedUntil: Date | null`. It is read here and written by 018.

## Domain (`src/domain/bookings/`)

```ts
// schedulePolicy.ts
interface Commitment { id: string; requestId: string; startsAt: Date; endsAt: Date; travelBufferMinutes: number }
function clashes(a: Commitment, b: Commitment): boolean          // max margin, strict inequalities
function firstConflict(candidate: Commitment, held: readonly Commitment[]): Commitment | null
function holdsSameRequest(candidate: Commitment, held: readonly Commitment[]): boolean

// booking.ts additions
Booking.forRequest(...)   // now copies commission, travelBufferMinutes, endsAt, searchEndsAt
booking.isSearchOpenAt(now): boolean                              // now < searchEndsAt
booking.goalkeeperId, booking.assignedAt
```

## Application ports

```ts
// goalkeeperRequests/common/ports.ts additions
interface IBookingRepository {
  findByRequestIds(ids): Promise<Booking[]>;                                  // 010
  findById(id: string): Promise<Booking | null>;
  findAvailableCandidates(q: { zoneIds: string[]; excludeClientId: string; maxCommission: number; now: Date; cap: number }): Promise<Booking[]>;
  findAssignedToGoalkeeper(goalkeeperId: string, fromInclusive?: Date): Promise<Booking[]>;   // commitments
  countForGoalkeeper(goalkeeperId: string, now: Date): Promise<{ upcoming: number; past: number }>;
  findUpcomingForGoalkeeper(goalkeeperId, now, skip, limit): Promise<Booking[]>;
  findPastForGoalkeeper(goalkeeperId, now, skip, limit): Promise<Booking[]>;
}
interface IGoalkeeperRequestRepository { findByIds(ids: string[]): Promise<GoalkeeperRequest[]>; /* + 010 */ }

type AcceptanceResult =
  | { kind: 'accepted'; booking: Booking }
  | { kind: 'not_claimed' }                                  // classified by the handler
  | { kind: 'same_request' }
  | { kind: 'schedule_conflict'; conflictingBookingId: string }
  | { kind: 'insufficient_funds'; balance: number };
interface IBookingAcceptanceStore {
  accept(args: { bookingId: string; goalkeeperId: string; now: Date; commissionDraft: (booking: Booking) => MovementDraft }): Promise<AcceptanceResult>;
}
interface IAcceptanceAuditLogger { logAcceptance(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void }

// auth/common/ports.ts
interface IUserRepository { getByIds(ids: string[]): Promise<User[]>; /* + existing */ }
```

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| Pending, enabled zone, search open, not own, affordable | candidate query + handler | FR-001(a–d, f) |
| No clash, not the same request | `schedulePolicy` (list filter and in-transaction check) | FR-001(e, g), FR-008, FR-009 |
| Empty with a reason when suspended or funds are short | available-bookings handler | FR-002 |
| Assign + charge atomically | acceptance store transaction | FR-004 |
| Every condition re-checked; distinct reasons | acceptance handler + store | FR-005 |
| One winner per booking | conditional claim | FR-006 |
| Replay without a second charge | pre-transaction read + `commission:<bookingId>` | FR-007 |
| Travel margin setting with default and warning | quote handler | FR-010 |
| Suspension honored | profile `suspendedUntil` | FR-011 |
| Contacts only after assignment | response builders + `getByIds` | FR-012, FR-013 |
| Agenda order and ownership | agenda query | FR-014 |
| Audit | `IAcceptanceAuditLogger` | FR-015 |
| Commission fixed at quote; refused when missing | quote handler | FR-017 |
