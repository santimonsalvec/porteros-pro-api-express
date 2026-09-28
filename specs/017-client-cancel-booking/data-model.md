# Data Model: Client Cancels Bookings

**Feature**: `017-client-cancel-booking` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

No new collection and no new index.

## `bookings` (changed)

| Field | Change |
|---|---|
| `endReason` | Also `'client_cancelled'`. |
| `cancelledBy` | Also `'client'`. |
| `cancellationNote` | New: `string \| null`, the client's optional reason (trimmed, ≤ 200 characters). Absent means `null`. |

Transitions added:

```text
pending_assignment ── client cancels (any time while pending) ─────────────────▶ cancelled (by client)
assigned ─────────── client cancels, now ≤ start − free-cancellation period ──▶ cancelled (by client) + commission refund
assigned ─────────── client cancels, later ─────────────────────────────────── refused (window closed); unchanged
```

## `goalkeeperRequests`

No new field. `active` becomes `false` when the cancellation leaves nothing pending or assigned (016's rule).

## `walletMovements`

A `commission_refund` with:
- `cancellation: { by: 'client', at, reason: <note or 'client_cancelled'> }`;
- the same `causeKey: commission_refund:{bookingId}` as 011 and 016: at most one refund per booking, whatever path.

## `outbox`: `booking.cancelled` (payload widened)

| Field | Values |
|---|---|
| `reason` | `'cancel_all'` (016) \| `'client_cancelled'` (017) |
| `by` | `'system'` (016) \| `'client'` (017) |

Other fields are unchanged (`goalkeeperId`, `refundedAmount`, `currency`…). The client's free-text note is not in the event.

## Ports

| Port | Change |
|---|---|
| `IBookingLifecycleStore` | `cancelByClient(args): Promise<ClientCancelResult>`, where `ClientCancelResult` is `{ kind: 'cancelled'; cancelled: Booking[]; refunds: number; events }` \| `{ kind: 'replayed' }` \| `{ kind: 'not_found'; what: 'request' \| 'booking' }` \| `{ kind: 'already_final'; status }` \| `{ kind: 'window_closed'; bookingId; freeCancellationUntil: Date }` \| `{ kind: 'owner_required'; goalkeeperId }` \| `{ kind: 'missing_charge'; bookingId }`. |
| `BookingConfirmationOutcome` / audit | New outcomes for the cancellation audit entries (plan). |
