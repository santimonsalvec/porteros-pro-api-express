# Data Model: Booking Expiry and "Cancel All"

**Feature**: `016-booking-expiry-cancel-all` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

No new collection. New fields and indexes on existing ones.

## `bookings` (changed)

| Field | Type | Rules |
|---|---|---|
| `status` | existing | Now also reaches `expired` and `cancelled`. |
| `endedAt` | Date \| null | New. When it expired or was cancelled. Absent on old documents means `null`. |
| `endReason` | `'search_ended' \| 'cancel_all' \| null` | New. |
| `cancelledBy` | `'system' \| null` | New. 017 adds `'client'`. |
| `goalkeeperId`, `assignedAt` | existing | **Kept** when an assigned booking is cancelled, so the agenda shows it. |

Transitions written by this feature (all conditional on the current status):

```text
pending_assignment ── searchEndsAt ≤ now (sweep) ──────────────────▶ expired    (endReason search_ended)
pending_assignment ── cancel-all evaluation, not all assigned ─────▶ cancelled  (endReason cancel_all, by system)
assigned ─────────── cancel-all evaluation, not all assigned ─────▶ cancelled  (+ commission refund)
```

Index: none new. Expiry uses `status_searchEnds` (015); the request's bookings use `requestId`.

## `goalkeeperRequests` (changed)

| Field | Type | Rules |
|---|---|---|
| `cancelAllEvaluatedAt` | Date \| null | New. Set exactly once by the "cancel all" evaluation, whether it kept or cancelled. Absent means `null`. |
| `active` | existing | Set to `false` when no booking of the request is `pending_assignment` or `assigned` any more (all expired or cancelled). It frees the one-active-request-per-match unique index (FR-019). |

New index: `cancelAll_due` `{ partialFulfillment: 1, cancelAllEvaluatedAt: 1, startsAt: 1 }`.

Derived status (`requestStatusOf`), in order:
1. any pending: `searching` / `partially_assigned`;
2. any assigned: `assigned`;
3. any completed: `completed`;
4. any cancelled: `cancelled` (new);
5. any expired: `expired` (new);
6. otherwise `closed`.

## `walletMovements` (existing type, new use)

A `commission_refund` with:
- `amount`: `+` the booking's `commission_charge` amount;
- `causeKey`: `commission_refund:{bookingId}` (unique);
- `actor`: system;
- `references`: `{ bookingId, requestId }`;
- `cancellation`: `{ by: 'system', at, reason: 'cancel_all' }`.

## `notifications` (changed)

| Field | Type | Rules |
|---|---|---|
| `dedupeKey` | string | New, optional. At most one entry per key. Used by: `request-outcome:{requestId}` (client), `booking-cancelled:{bookingId}` (goalkeeper). |

New index: `dedupe_unique` `{ dedupeKey: 1 }`, unique, `partialFilterExpression: { dedupeKey: { $exists: true } }`.

New inbox types:

| Type | Recipient | When |
|---|---|---|
| `request.expired` | client | All bookings of the request expired |
| `request.partially_expired` | client | "Keep confirmed": some assigned, the rest expired |
| `request.cancelled` | client | Cancelled by "cancel all" |
| `booking.cancelled` | goalkeeper | Their assigned booking was cancelled by "cancel all" (with the refund) |

## `outbox` (new event types)

| Type | Payload |
|---|---|
| `booking.expired` | `{ clientId, zoneId, startsAt }` |
| `booking.cancelled` | `{ clientId, zoneId, startsAt, goalkeeperId: string \| null, refundedAmount: number \| null, currency, reason: 'cancel_all', by: 'system' }` |

## Quote (response only)

`IssuedServiceQuote` gains:
- `cancelAllUntil`: ISO, start − free-cancellation period;
- `cancelAllAvailable`: boolean.

No stored change: the quote already holds `freeCancellationMinutes`.

## Ports (new or extended)

| Port | Methods |
|---|---|
| `IBookingLifecycleStore` (new, `features/bookingLifecycle`) | `expire(requestId, now, events: (expired: Booking[]) => DomainEvent[]): Promise<{ expired: Booking[]; events: DomainEvent[]; deactivated: boolean }>`; `cancelAll(args): Promise<{ kind: 'already_evaluated' } \| { kind: 'kept' } \| { kind: 'cancelled'; cancelled: Booking[]; refunds: number; events: DomainEvent[] }>` |
| `IBookingRepository` | `findDueForExpiry(now, cap): Promise<Booking[]>` |
| `IGoalkeeperRequestRepository` | `findDueForCancelAll(now, cap): Promise<GoalkeeperRequest[]>` |
| `INotificationRepository` (015) | `createIfAbsent(entry & { dedupeKey }): Promise<boolean>` |
