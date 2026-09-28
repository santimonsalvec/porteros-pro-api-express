# Research: Client Cancels Bookings

**Feature**: `017-client-cancel-booking` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- the endpoint paths (§1);
- how the transaction mirrors 012 and 016 (§2);
- how 016's evaluation excludes client-cancelled bookings (§4).

The clarifications fix three things: a whole-request cancellation in the last hour is refused as a whole; cancelled matches stay in the agenda; client-cancelled bookings don't count for "cancel all".

---

## §1 Endpoints

**Decision**: Under the existing client router `/api/goalkeeper-requests`, where `/bookings` lists the client's requests (010). It already requires `requireAuth`, `requireClientOnly` and `requireCompleteProfile`.

| Method and path | Purpose |
|---|---|
| `POST /api/goalkeeper-requests/bookings/{requestId}/cancel` | Cancel the whole request |
| `POST /api/goalkeeper-requests/bookings/{requestId}/bookings/{bookingId}/cancel` | Cancel one booking |

- Body: `{ "reason"?: string }`, up to 200 characters.
- Success: `200` with the request as 010 returns it (`RequestResponse`, with its bookings' new statuses), so the app refreshes from the answer.
- A `POST` sub-resource, like 012's `/accept`.

**Rationale**: It's the client's own resource, and the answer shape the app already renders.

## §2 One transaction per cancellation

**Decision**: `IBookingLifecycleStore.cancelByClient({ requestId, clientId, bookingId | null, now, reason, owners, newId, buildEvent })`, in the same `MongoBookingLifecycleStore` as 016, with one `withTransaction`:
1. Read the request (`_id`, `clientId`) in the session. Missing, or another client's → `not_found`.
2. Read its bookings. Pick the targets:
   - **one booking**: it must belong to the request, else `not_found`:
     - already cancelled by the client → `replayed` (no write, FR-010);
     - `expired`, `cancelled` by the system, `completed` or `goalkeeper_withdrew` → `already_final { status }`;
   - **whole request**: every `pending_assignment` and `assigned` booking. None → `replayed` if any booking was cancelled by the client, else `already_final`.
3. **Deadline**: if any target is `assigned` and `now > request.freeCancellationUntil()` (010's inclusive rule) → `window_closed { bookingId, freeCancellationUntil }`. **Nothing is written** (clarification 1).
4. For each target:
   - a conditional update from its current status to `cancelled`, with `endedAt`, `endReason: 'client_cancelled'`, `cancelledBy: 'client'`, `cancellationNote: reason`;
   - an assigned target gets the refund through the shared helper from 016, extracted (§3), with cancellation `{ by: 'client', at: now, reason: reason ?? 'client_cancelled' }`;
   - one `booking.cancelled` event each.
5. `appendEventsInSession`, and deactivate the request when nothing is live (016's `deactivateIfEnded`).

After the commit, the command handler relays the events (013).

**Race with acceptance** (FR-009): both write the booking document, so the driver retries the loser. If the acceptance won, the retried cancellation reads `assigned` and applies the assigned rules: a refund if in time, `window_closed` if not. If the cancellation won, the acceptance's claim finds it `cancelled` → `not_available`. The refund reads the charge in the same snapshot, so there's never a charge left without its refund.

**Owners**: the handler resolves the ledger owner of each goalkeeper assigned at read time (`resolveGoalkeeperWalletContext`, as 016's job does). If an acceptance lands between that read and the transaction, the store finds an assigned target without an owner and returns `owner_required { goalkeeperId }`. The handler resolves that owner and retries once. A context that can't be resolved → `refund_unavailable`: a temporary refusal, and nothing changes (spec edge case).

## §3 Shared refund helper

**Decision**: Extract 016's private `refund()` from `MongoBookingLifecycleStore` into a module-level `refundCommissionInSession(db, session, booking, owner, cancellation, newId, now)`, used by both `cancelAll` and `cancelByClient`. It:
- finds `commission:{bookingId}` (missing → abort `missing_charge`);
- reuses an existing `commission_refund:{bookingId}`;
- otherwise appends `commissionRefundDraft`.

FR-011 is automatic: one cause key, whatever path refunds first.

## §4 "Cancel all" ignores client-cancelled bookings (clarification 3)

**Decision**: In `cancelAll` (store and fake), the evaluation looks at `bookings.filter(b => b.cancelledBy !== 'client')`:
- empty → `kept`: there's nothing to evaluate; mark it evaluated;
- all assigned → `kept`;
- otherwise cancel the remaining pending and assigned ones.

`findDueForCancelAll` is unchanged: an inactive request (all ended) is already skipped.

## §5 Events, notices and what the client sees

- **Event**: `booking.cancelled` gains `reason: 'cancel_all' | 'client_cancelled'` and `by: 'system' | 'client'`. The `bookingCancelled(...)` factory takes them; the zod schema accepts both. The client's free-text reason is **not** put in the event: it stays on the booking and the refund.
- **Goalkeeper notice** (016's `GoalkeeperCancellationNoticeHandler`): when `by === 'client'`, the text is "El cliente canceló tu partido en Bello · … Te devolvimos 7.000 COP." Same type `booking.cancelled`, same dedupe key.
- **Client notice** (016's `ClientOutcomeNoticeHandler`):
  - it ignores `booking.cancelled` events with `by: 'client'`, since the client did it;
  - it computes outcomes over the bookings **not** cancelled by the client;
  - if none remain, there's no notice. For example, a "keep confirmed" request where the client cancelled one booking and the other expired gives `request.expired`.
- **Agenda** (clarification 2): unchanged. It lists by `goalkeeperId`, and cancelled bookings keep it.
- **Status**: `requestStatusOf` already gives `cancelled` when nothing live remains and a booking is cancelled.

## §6 Domain

`Booking`:
- `endReason` gains `'client_cancelled'`;
- `cancelledBy` gains `'client'`;
- new `cancellationNote: string | null` (the client's reason, ≤ 200 characters, trimmed).

The command validates the reason's length (zod in the controller, and a domain guard).

## §7 Answers

| Outcome | HTTP |
|---|---|
| `cancelled` / `replayed` | `200` with the request |
| `not_found` | `404 request_not_found` / `booking_not_found` |
| `already_final` | `409 booking_not_cancellable { status }` |
| `window_closed` | `409 cancellation_window_closed { bookingId, freeCancellationUntil }`, message: the goalkeeper must be used or paid |
| `refund_unavailable` | `503 cancellation_temporarily_unavailable` with `Retry-After: 60` |

Every attempt is audited through the existing booking audit logger (like 010 and 012).
