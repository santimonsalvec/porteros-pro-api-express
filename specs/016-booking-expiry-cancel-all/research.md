# Research: Booking Expiry and "Cancel All"

**Feature**: `016-booking-expiry-cancel-all` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- how due bookings and requests are found (§2, §3);
- how transitions stay exactly-once under overlapping sweeps and concurrent acceptances (§2–§4);
- the notice data (§6).

The clarifications fix two things: late "cancel all" requests are refused at confirmation (§7), and client notices ship here (§6).

---

## §1 Two scheduled jobs on 013's sweep

**Decision**: Two `IScheduledJob`s, registered in `jobs: [...]` before 015's `offer-reminders`:
- `cancel-all` (research §3);
- `booking-expiry` (§2).

Each has `leaseSeconds = 55`, so 013's job lock already prevents two sweeps from running the same job at once. Each job processes at most 500 items per run (logged when reached); the rest go to the next minute. Within a run, each request is its own transaction, and a failure is logged and skipped (FR-016).

`cancel-all` runs first. If a request is both due for evaluation and has bookings past their search end (a travel margin larger than the free-cancellation period), it's evaluated with those bookings still pending. They count as "not assigned" either way, so the outcome is the same.

**Rationale**: It's the sweep 013 built for this. The job lock plus per-item conditional writes (§2–§3) give exactly-once, even if a lease expires mid-run.

## §2 Expiry: one transaction per request

**Decision**:
1. `IBookingRepository.findDueForExpiry(now, cap)`: `{ status: 'pending_assignment', searchEndsAt: { $lte: now } }`, using 015's `status_searchEnds` index, grouped by `requestId`.
2. Per request, `IBookingLifecycleStore.expire(requestId, now, events)` runs one `withTransaction`:
   - `updateMany({ requestId, status: 'pending_assignment', searchEndsAt: { $lte: now } }, { $set: { status: 'expired', endedAt: now, endReason: 'search_ended' } })`, after reading the matched ids in the session so it knows which bookings it expired;
   - `appendEventsInSession`: one `booking.expired` per booking it actually expired;
   - if no booking of the request is still `pending_assignment` or `assigned`, `$set: { active: false }` on the request (FR-019).
3. After the commit, 013's `EventRelay` publishes the events, so the notices go out within the same sweep.

**Exactly-once**: the status condition makes a second sweep match nothing: no event, no notice.

**Race with acceptance**: acceptance (012) claims with `status: 'pending_assignment', searchEndsAt: { $gt: now }` inside its own transaction. Both write the same booking document. MongoDB aborts one with a write conflict, and the driver retries it. The retry either finds the booking assigned (expiry skips it) or finds it expired (acceptance → `not_claimed` → `search_ended`). Never both (FR-014).

**Alternatives considered**: one transaction per booking. It's simpler, but it can't make "request no longer active" atomic with the last booking of the request.

## §3 "Cancel all": evaluate once, all or nothing

**Decision**:
- New request field `cancelAllEvaluatedAt: Date | null`.
- `IGoalkeeperRequestRepository.findDueForCancelAll(now, cap)`: `{ partialFulfillment: 'cancel_all', active: true, cancelAllEvaluatedAt: null, startsAt: { $lte: now + 24 h } }`, then an in-memory filter `now >= request.freeCancellationUntil()`. Each request carries its own period. Served by the new index `cancelAll_due` `{ partialFulfillment: 1, cancelAllEvaluatedAt: 1, startsAt: 1 }`.
- Per request, the application prepares the ledger owners of the assigned goalkeepers first, with `resolveGoalkeeperWalletContext` (011). If a context can't be resolved, the request is skipped and logged, and retried next sweep. Then `IBookingLifecycleStore.cancelAll(...)` runs one `withTransaction`:
  1. `findOneAndUpdate({ _id: requestId, cancelAllEvaluatedAt: null }, { $set: { cancelAllEvaluatedAt: now } })`: the **exactly-once gate**. `null` means another sweep did it, and it returns `already_evaluated`.
  2. It reads the request's bookings in the session. If all are `assigned`, it commits (the request is marked evaluated and firm) and returns `kept`.
  3. Otherwise, for each `pending_assignment` or `assigned` booking:
     - a conditional update to `cancelled`, with `endedAt`, `endReason: 'cancel_all'`, `cancelledBy: 'system'`. The goalkeeper stays recorded, so the agenda shows it;
     - for an assigned one, a refund movement with `appendMovementInSession`: amount = the stored `commission_charge` of `commission:{bookingId}` (found in the session), `causeKey: commission_refund:{bookingId}` (the key 011's `refundCommission` already uses, so 016 and 017 can never refund one booking twice) (unique → never twice), cancellation `{ by: 'system', at: now, reason: 'cancel_all' }`;
     - one `booking.cancelled` event each.
  4. It sets the request `active: false`, since no booking remains pending or assigned. Expired bookings stay expired.
  5. It returns `cancelled { bookings, refunds }`.
- After the commit: `EventRelay.relay(events)`.

**Race with acceptance**: both transactions write the booking document, so one retries. If acceptance commits first, the evaluation's retry re-reads and finds everything assigned → `kept`. If the evaluation commits first, acceptance's claim finds `cancelled` → `not_claimed` → `not_available`. A charge is never left without its refund (FR-014): the refund reads the charge in the same snapshot.

**Rationale**: The request-level gate makes the whole evaluation idempotent; the refund's `causeKey` makes money idempotent even if something else went wrong.

## §4 Domain additions

**Decision**:
- `Booking` gains `endedAt: Date | null`, `endReason: 'search_ended' | 'cancel_all' | null` and `cancelledBy: 'system' | null`. They're rehydrated from documents; absent means `null`. `expired` and `cancelled` are already in `BOOKING_STATUSES`.
- `GoalkeeperRequest` gains `cancelAllEvaluatedAt: Date | null`.
- `requestStatusOf` gains `'cancelled'` (no pending or assigned, at least one cancelled) and `'expired'` (no pending or assigned, none cancelled, at least one expired), ahead of `'closed'` (FR-018).
- `bookingEvents.ts` gains:
  - `bookingExpired(id, booking, at)`: payload `{ clientId, zoneId, startsAt }`;
  - `bookingCancelled(id, booking, at, refund)`: payload `{ clientId, zoneId, startsAt, goalkeeperId | null, refundedAmount | null, currency, reason: 'cancel_all', by: 'system' }`.

  `DomainEventType` gains `'booking.expired' | 'booking.cancelled'`, and 013's `eventSchemas.ts` gets their zod schemas.

## §5 Money

**Decision**: A new pure draft builder in `walletLedger.ts`, `commissionRefundDraft(owner, { bookingId, requestId, amount, cancellation }, id, at)`: type `commission_refund`, amount `+charge`, `causeKey: commission_refund:{bookingId}` (the key 011's `refundCommission` already uses, so 016 and 017 can never refund one booking twice), actor system. The existing `WalletLedger.refundCommission` uses the same builder, so 017 and 016 can never produce different refunds.

## §6 Notices as idempotent event consumers

**Decision**: Two consumers, subscribed like 015's offers (013 `runOnce`):
- **`ClientOutcomeNoticeHandler`** (`booking.expired`, `booking.cancelled`): loads the request and its bookings, then creates one inbox entry for the client, keyed `request-outcome:{requestId}`:
  - all expired: type `request.expired`, "No logramos hallar un portero para tu partido";
  - some assigned and the rest expired ("keep confirmed"): type `request.partially_expired`, "Conseguimos N de M porteros para tu partido";
  - cancelled: type `request.cancelled`, "Cancelamos tu solicitud: no se confirmaron todos los porteros a tiempo".

  Each also includes the zone and the local start. It pushes only when this call created the entry, so both events of a request give **one** notice (FR-004, FR-012).
- **`GoalkeeperCancellationNoticeHandler`** (`booking.cancelled` with a goalkeeper): an entry keyed `booking-cancelled:{bookingId}`, type `booking.cancelled`, "Se canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP", then a push.

Both use `data { type, requestId, bookingId? }`, which follows 014's convention.

**Generic dedupe in the inbox**: `INotificationRepository.createIfAbsent(entry & { dedupeKey })`, backed by a new unique partial index `dedupe_unique` on `dedupeKey`. 015's offers keep their own key.

**Rationale**:
- A consumer is re-delivered until it succeeds (013), so a crash after the commit never loses a notice.
- The dedupe key guarantees "once", even across two events and simultaneous deliveries.
- 019 reuses this for its client notices.

## §7 Late "cancel all" (clarification 1)

**Decision**:
- **Quote**: `IssuedServiceQuote` gains:
  - `cancelAllUntil`: ISO, start − free-cancellation period;
  - `cancelAllAvailable`: `now < cancelAllUntil`.
- **Confirmation**: when `partialFulfillment === 'cancel_all'`, and after the replay check (a retry of an accepted confirmation still answers), the handler loads the quote (`findByIdForClient`). If `now >= start − freeCancellationMinutes`, it returns the new outcome `cancel_all_not_available { cancelAllUntil }` → `409 cancel_all_not_available`. Nothing is claimed.

**Rationale**: It's the same boundary the evaluation uses (§3), so a request that passes the check is always evaluated in the future.

## §8 What the goalkeeper and client see

- The agenda (012) lists by `goalkeeperId`. Cancelled bookings keep it, so they show with status `cancelled`, and clashes only count `assigned` (FR-020). No change is needed beyond status mapping.
- "My requests" (010) derives the status (§4), so it shows `expired`, `cancelled` or `assigned`.
- Available matches, offers, reminders and the inbox's `stillAvailable` only consider `pending_assignment` with the search open (015), so expired and cancelled bookings disappear everywhere with no change (FR-002, SC-006).

## §9 Observability

The jobs return a summary string for the sweep report and log:
- `bookings_expired { requests, bookings }`;
- `cancel_all_evaluated { kept, cancelled, refunds, skipped }`;
- `cancel_all_skipped { requestId, reason }`;
- `lifecycle_item_failed { job, requestId, err }`.

The consumers log `outcome_notice_sent`.
