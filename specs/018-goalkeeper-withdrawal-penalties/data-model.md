# Data Model: Goalkeeper Withdrawal, Penalties and Suspensions

**Feature**: `018-goalkeeper-withdrawal-penalties` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

One new collection, `goalkeeperIncidents`. New fields on `bookings`, `goalkeeperProfiles`, `bookingSettings` and `notifications` (offers).

## `goalkeeperIncidents` (new)

One document per withdrawal. Feature 021 adds no-shows with `kind: 'no_show'`.

| Field | Type | Notes |
|---|---|---|
| `_id` | string (uuid v7) | The withdrawal's id in the API |
| `kind` | `'withdrawal'` | 021: `'no_show'` |
| `goalkeeperId` | string | |
| `bookingId` | string | Unique per kind |
| `requestId` | string | |
| `startsAt` | Date | The match start |
| `occurredAt` | Date | When the goalkeeper withdrew |
| `noticeMinutes` | integer ≥ 0 | `floor((startsAt − occurredAt) / 1 min)` |
| `late` | boolean | `noticeMinutes < lateNoticeMinutes` (the config in force) |
| `reason` | string \| null | The goalkeeper's note, ≤ 200 |
| `replacementBookingId` | string \| null | The booking created in its place, if any |
| `penalties` | `Penalty[]` | 0–2 entries |
| `moneyReversal` | `{ by, at, reason, amount, currency }` \| null | The admin's commission refund |
| `forgivenAt` | Date \| null | Set by the first reversal of any kind. Forgiven incidents don't count toward the weekly limit |

`Penalty`:

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid v7) | |
| `kind` | `'late' \| 'weekly_limit'` | |
| `days` | integer ≥ 1 | From the config in force |
| `startsAt` | Date | = `occurredAt` |
| `endsAt` | Date | `startsAt + days × 24 h` |
| `reversal` | `{ by: adminId, at, reason }` \| null | Lifted by an admin |

**Indexes**:
- `goalkeeper_occurred`: `{ goalkeeperId: 1, occurredAt: -1, _id: -1 }`, for the history and the window;
- `kind_booking_unique`: `{ kind: 1, bookingId: 1 }`, unique.

**Domain**: `GoalkeeperIncident` (entity, `src/domain/goalkeepers/goalkeeperIncident.ts`):
- `countsTowardLimit()` is `forgivenAt === null`;
- `penaltiesInForce(now)`: the penalties that aren't reversed and whose `endsAt > now`.

`suspensionEndOf(incidents, now)` gives the latest `endsAt` among them, or `null`.

## `bookings` (changed)

| Field | Change |
|---|---|
| `status` | `goalkeeper_withdrew` becomes reachable (it's already in `BOOKING_STATUSES`). |
| `endReason` | Also `'goalkeeper_withdrew'`. |
| `cancelledBy` | Also `'goalkeeper'`. |
| `cancellationNote` | Also the goalkeeper's reason. |
| `replacesBookingId` | New: `string \| null`. Absent means `null`. |
| `excludedGoalkeeperIds` | New: `string[]`. Absent means `[]`. Never changes after creation. |

No new index: the replacement is found by `requestId`, and offers use `status_searchEnds` (015).

```text
assigned ── goalkeeper withdraws, now < startsAt ──▶ goalkeeper_withdrew  (goalkeeperId kept)
             └─ and now < searchEndsAt ───────────▶ + new booking: pending_assignment (replacesBookingId, excludedGoalkeeperIds)
assigned ── now ≥ startsAt ───────────────────────── refused (match_started)
other ───────────────────────────────────────────── refused (not_withdrawable)
```

## `goalkeeperProfiles` (changed)

| Field | Change |
|---|---|
| `suspendedUntil` | Now written by 018: always `suspensionEndOf(incidents in force)`. |
| `penaltiesUpdatedAt` | New: `Date`. Written by every withdrawal and reversal, so concurrent ones for the same goalkeeper conflict and retry (research §2). |

## `bookingSettings` (changed, country scope only)

| Field | Type | Default (Colombia) |
|---|---|---|
| `goalkeeperPenalties.lateNoticeMinutes` | integer ≥ 1 | 120 |
| `goalkeeperPenalties.lateSuspensionDays` | integer ≥ 1 | 3 |
| `goalkeeperPenalties.weeklyLimit` | integer ≥ 1 | 3 |
| `goalkeeperPenalties.windowDays` | integer ≥ 1 | 7 |
| `goalkeeperPenalties.limitSuspensionDays` | integer ≥ 1 | 7 |

The whole object is optional. Each missing field falls back to its default, with a warning. An invalid value is an `InvalidConfigurationError`, like the other settings.

## `notifications` (changed)

- **Offer entries** (type `booking.offer`) can be **renewed** in place for a replacement (research §4): the title, body, data (`bookingId` = the replacement) and `createdAt` change, and `readAt`, `dismissedAt`, `notifiedAt` and `lastRemindedAt` become `null`, with `reminderCount: 0`.
- **New inbox types**, with dedupe keys:

| Type | For | Dedupe key |
|---|---|---|
| `booking.goalkeeper_withdrew` | client | `withdrawal-client:{bookingId}` |
| `goalkeeper.suspended` | goalkeeper | `withdrawal-suspension:{bookingId}` |

- **016's outcome key** becomes `request-outcome:{requestId}` or `request-outcome:{requestId}:{latestReplacementId}`.

## `walletMovements`

The admin money reversal is a `commission_refund`:
- `actor: { kind: 'admin', userId }`;
- `cancellation: { by: 'admin', at, reason }`;
- `causeKey: commission_refund:{bookingId}`, the same key as 011, 016 and 017, so there's at most one refund per booking.

## `outbox`: events

| Event | Payload |
|---|---|
| `goalkeeper.withdrew` (new, v1) | `goalkeeperId`, `clientId`, `zoneId`, `startsAt`, `noticeMinutes`, `late`, `replacementBookingId \| null`, `suspendedUntil \| null` (set only when this withdrawal applied a penalty), `penalties: [{ kind, days, endsAt }]` |
| `booking.created` (widened) | Optional `replacesBookingId` |

The goalkeeper's free-text reason is not in the event.

## Ports

| Port | Change |
|---|---|
| `IBookingLifecycleStore` | `withdraw(args): Promise<WithdrawResult>` and `reverseWithdrawal(args): Promise<ReversalOutcome>` (research §2, §9). |
| `IGoalkeeperIncidentRepository` (new) | `listForGoalkeeper(goalkeeperId, skip, limit)`, `countForGoalkeeper(goalkeeperId)`, `ensureIndexes()`. |
| `INotificationRepository` | `renewOffer(offer: NewOffer): Promise<boolean>`. |
| `IBookingSettingsRepository` / `BookingSettings` | `goalkeeperPenalties`. |
| `IBookingAuditLogger` | `logWithdrawal`, `logPenaltyReversal`. |

`WithdrawResult`:

```ts
| { kind: 'withdrawn'; booking: Booking; incident: GoalkeeperIncident; replacement: Booking | null; suspendedUntil: Date | null; events: DomainEvent[] }
| { kind: 'replayed'; booking: Booking; incident: GoalkeeperIncident; suspendedUntil: Date | null }
| { kind: 'not_found' }
| { kind: 'not_withdrawable'; status: BookingStatus }
| { kind: 'match_started'; startsAt: Date }
```

`ReversalOutcome`:

```ts
| { kind: 'reversed'; incident: GoalkeeperIncident; suspendedUntil: Date | null }
| { kind: 'replayed'; incident: GoalkeeperIncident; suspendedUntil: Date | null }
| { kind: 'not_found' }
| { kind: 'missing_charge'; bookingId: string }
```
